import assert from 'node:assert/strict';
import { RPPGEngine } from '../rppgEngine.js';

/**
 * Helper: Generate realistic synthetic facial RGB series with cardiac blood-volume pulse
 * Hemoglobin absorbs green most strongly, followed by blue and red, plus common-mode illumination drift.
 */
function generateSyntheticFacialRGB({
    trueBpm,
    durationSec = 10,
    sampleRate = 30,
    secondHarmonicRatio = 0.22,
    subHarmonicNoiseRatio = 0.0,
    jitterMs = 0,
    phaseOffsetRad = 0
}) {
    const f0 = trueBpm / 60;
    const n = Math.round(durationSec * sampleRate);
    const dtMs = 1000 / sampleRate;
    const samples = [];

    // Deterministic pseudo-random generator for reproducible jitter & noise
    let seed = 1337;
    const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646 - 0.5;
    };

    for (let i = 0; i < n; i++) {
        const jitter = i === 0 ? 0 : rand() * 2 * jitterMs;
        const tMs = Math.max(samples.length > 0 ? samples[samples.length - 1].t + 4 : 0, i * dtMs + jitter);
        const tSec = tMs / 1000;

        // Physiological pulse waveform: fundamental + dicrotic 2nd harmonic + optional ambient f/2 noise
        const fundamental = Math.sin(2 * Math.PI * f0 * tSec + phaseOffsetRad);
        const dicrotic2nd = secondHarmonicRatio * Math.sin(4 * Math.PI * f0 * tSec + 0.65 + phaseOffsetRad);
        const subHarmonicNoise =
            subHarmonicNoiseRatio * Math.sin(2 * Math.PI * (f0 * 0.5) * tSec + 0.3);
        const bvp = fundamental + dicrotic2nd + subHarmonicNoise;

        // Slow common-mode auto-exposure / illumination drift
        const lumaDrift = 1 + 0.015 * Math.sin(2 * Math.PI * 0.22 * tSec);

        // Realistic skin tone baseline (R=185, G=142, B=118) with differential BVP modulation
        const r = (185 + 0.35 * bvp) * lumaDrift;
        const g = (142 - 1.45 * bvp) * lumaDrift;
        const b = (118 - 0.55 * bvp) * lumaDrift;

        samples.push({ r, g, b, t: tMs });
    }
    return samples;
}

console.log('=== VitalSync RPPGEngine Synthetic Signal Verification Suite ===\n');

const engine = new RPPGEngine(null, () => {});
const targetRates = [60, 75, 92, 115];

// 1. Test 60, 75, 92, and 115 BPM synthetic signals (confirming 115 BPM is NOT halved to 57.5 BPM)
for (const targetBpm of targetRates) {
    // For 115 BPM, inject 35% amplitude (~12% power) sub-harmonic ambient noise at 57.5 BPM
    // to prove the upgraded rule never falsely halves true 115 BPM tachycardia/elevated HR.
    const samples = generateSyntheticFacialRGB({
        trueBpm: targetBpm,
        durationSec: 10,
        sampleRate: 30,
        secondHarmonicRatio: 0.25,
        subHarmonicNoiseRatio: targetBpm === 115 ? 0.35 : 0.15
    });

    const uniform = engine.resampleRGBSeriesUniform(samples, 30);
    const pos = engine.computePOSSignal(uniform, 30);
    const bp = engine.applyZeroPhaseBandpass(pos, 0.78, 2.35, 30);
    const result = engine.estimateHeartRateFromPOS(bp, 30);

    const err = Math.abs(result.bpm - targetBpm);
    console.log(
        `[Test 1] Target: ${targetBpm} BPM -> Estimated: ${result.bpm.toFixed(2)} BPM (|err| = ${err.toFixed(2)} BPM, purity = ${result.spectralPurity.toFixed(2)}, autocorr = ${result.autocorr.toFixed(2)})`
    );
    assert.ok(
        err <= 1.2,
        `Expected ${targetBpm} BPM within ±1.2 BPM, got ${result.bpm.toFixed(2)} BPM`
    );
}

// 2. Test Dicrotic-Notch waveform at 68 BPM with strong 136 BPM 2nd harmonic
{
    const targetBpm = 68;
    // Second harmonic amplitude 1.22x fundamental -> 2nd harmonic power at 136 BPM is ~1.49x fundamental power at 68 BPM
    // Fundamental power is ~67% of maxPower (>= 42% threshold) and time-domain autocorrelation peaks at full 68 BPM period
    const dicroticSamples = generateSyntheticFacialRGB({
        trueBpm: targetBpm,
        durationSec: 10,
        sampleRate: 30,
        secondHarmonicRatio: 1.22,
        subHarmonicNoiseRatio: 0.0
    });

    const pos = engine.computePOSSignal(dicroticSamples, 30);
    const bp = engine.applyZeroPhaseBandpass(pos, 0.78, 2.35, 30);
    const result = engine.estimateHeartRateFromPOS(bp, 30);
    const err = Math.abs(result.bpm - targetBpm);

    console.log(
        `[Test 2] Dicrotic-Notch 68 BPM (with dominant 136 BPM 2nd harmonic) -> Estimated: ${result.bpm.toFixed(2)} BPM (|err| = ${err.toFixed(2)} BPM)`
    );
    assert.ok(
        err <= 1.5,
        `Expected Dicrotic-Notch 68 BPM to resolve fundamental ~68 BPM (not 136 BPM), got ${result.bpm.toFixed(2)} BPM`
    );
}

// 3. Test Non-Uniform Jittery Timestamps (+/- 14ms frame arrival jitter) resampled onto uniform 30 Hz grid
{
    const targetBpm = 84;
    const jitterySamples = generateSyntheticFacialRGB({
        trueBpm: targetBpm,
        durationSec: 10,
        sampleRate: 27, // Irregular non-30Hz base rate + heavy frame timestamp jitter
        secondHarmonicRatio: 0.25,
        jitterMs: 14
    });

    const resampled = engine.resampleRGBSeriesUniform(jitterySamples, 30);
    // Verify uniform 33.333ms spacing
    const dt0 = resampled[1].t - resampled[0].t;
    const dtMid = resampled[50].t - resampled[49].t;
    assert.ok(Math.abs(dt0 - 1000 / 30) < 1e-4 && Math.abs(dtMid - 1000 / 30) < 1e-4);

    const pos = engine.computePOSSignal(resampled, 30);
    const bp = engine.applyZeroPhaseBandpass(pos, 0.78, 2.35, 30);
    const result = engine.estimateHeartRateFromPOS(bp, 30);
    const err = Math.abs(result.bpm - targetBpm);

    console.log(
        `[Test 3] Jittery Non-Uniform Frame Timestamps (Target ${targetBpm} BPM) -> Resampled 30Hz Estimated: ${result.bpm.toFixed(2)} BPM (|err| = ${err.toFixed(2)} BPM)`
    );
    assert.ok(
        err <= 1.5,
        `Expected jittery resampled signal to lock within ±1.5 BPM of ${targetBpm}, got ${result.bpm.toFixed(2)} BPM`
    );
}

// 4. Test Multi-ROI Spatial Coherence across Forehead, Left Cheek, and Right Cheek
{
    const multiEngine = new RPPGEngine(null, () => {});
    const targetBpm = 78;
    multiEngine.roiBuffers.forehead = generateSyntheticFacialRGB({
        trueBpm: targetBpm,
        durationSec: 8,
        sampleRate: 30,
        phaseOffsetRad: 0.0
    });
    multiEngine.roiBuffers.leftCheek = generateSyntheticFacialRGB({
        trueBpm: targetBpm,
        durationSec: 8,
        sampleRate: 30,
        phaseOffsetRad: 0.15
    });
    multiEngine.roiBuffers.rightCheek = generateSyntheticFacialRGB({
        trueBpm: targetBpm,
        durationSec: 8,
        sampleRate: 30,
        phaseOffsetRad: 0.25
    });

    const coherence = multiEngine.evaluateMultiROICoherence(30);
    console.log(
        `[Test 4] Multi-ROI Spatial Coherence (3 zones @ ${targetBpm} BPM) -> activeRois: ${coherence.activeRois}, roiCoherence: ${coherence.roiCoherence}, agreedBpm: ${coherence.agreedBpm?.toFixed(2)} BPM`
    );
    assert.equal(coherence.activeRois, 3);
    assert.equal(coherence.coherentPairFound, true);
    assert.ok(coherence.roiCoherence >= 0.75);
    assert.ok(Math.abs(coherence.agreedBpm - targetBpm) <= 1.5);
}

// 5. Test Contact Fingertip PPG Mode (`fingertip_cppg`) Absorption & Perfusion Index
{
    const targetBpm = 72;
    const f0 = targetBpm / 60;
    const fingerSamples = [];
    for (let i = 0; i < 240; i++) {
        const tMs = i * (1000 / 30);
        const tSec = tMs / 1000;
        const pulse = Math.sin(2 * Math.PI * f0 * tSec) + 0.3 * Math.sin(4 * Math.PI * f0 * tSec + 0.4);
        // Strong red contact illumination with ~2.2% AC/DC pulsatile modulation
        fingerSamples.push({
            r: 210 + 2.4 * pulse,
            g: 48 + 0.5 * pulse,
            b: 32 + 0.2 * pulse,
            t: tMs
        });
    }

    const { signal, perfusionIndex } = engine.computeFingertipPPGSignal(fingerSamples);
    const bp = engine.applyZeroPhaseBandpass(signal, 0.78, 2.35, 30);
    const est = engine.estimateHeartRateFromPOS(bp, 30);
    const err = Math.abs(est.bpm - targetBpm);

    console.log(
        `[Test 5] Contact Fingertip PPG (Target ${targetBpm} BPM) -> Estimated: ${est.bpm.toFixed(2)} BPM, IBI BPM: ${est.ibiBpm?.toFixed(2)} BPM, Perfusion Index: ${perfusionIndex}%`
    );
    assert.ok(err <= 1.2);
    assert.ok(perfusionIndex >= 0.5 && perfusionIndex <= 6.0);
}

console.log('\nAll RPPGEngine synthetic verification tests PASSED!');
