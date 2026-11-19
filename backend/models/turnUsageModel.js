import mongoose from 'mongoose';

const turnUsageSchema = new mongoose.Schema(
    {
        // UTC month key in YYYY-MM format
        monthKey: { type: String, required: true, unique: true },
        bytesUsed: { type: Number, default: 0 },
        warnEmailSentAt: { type: Date, default: null },
        cutoffEmailSentAt: { type: Date, default: null }
    },
    { timestamps: true }
);

const turnUsageModel = mongoose.models.turnUsage || mongoose.model('turnUsage', turnUsageSchema);
export default turnUsageModel;
