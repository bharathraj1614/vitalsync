import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../src/context/AppContext';
import { DoctorAvatar } from '../../src/components/DoctorAvatar';
import { SPECIALITIES, formatDoctorName } from '../../src/utils/clinical';
import { COLORS, RADIUS, SPACING } from '../../src/theme/tokens';

export default function DoctorsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ speciality?: string }>();
  const {
    doctors,
    doctorsLoading,
    getDoctorsData,
    isDoctorOnline,
    currencySymbol,
  } = useAppContext();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpeciality, setSelectedSpeciality] = useState<string>('All');
  const [onlineOnly, setOnlineOnly] = useState(false);

  useEffect(() => {
    if (params.speciality) {
      setSelectedSpeciality(String(params.speciality));
    }
  }, [params.speciality]);

  const filteredDoctors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return doctors.filter((doc) => {
      if (
        selectedSpeciality !== 'All' &&
        doc.speciality?.toLowerCase() !== selectedSpeciality.toLowerCase()
      ) {
        return false;
      }
      if (onlineOnly && !isDoctorOnline(doc._id)) {
        return false;
      }
      if (!q) return true;
      return (
        doc.name?.toLowerCase().includes(q) ||
        doc.speciality?.toLowerCase().includes(q) ||
        doc.degree?.toLowerCase().includes(q) ||
        doc.about?.toLowerCase().includes(q)
      );
    });
  }, [doctors, searchQuery, selectedSpeciality, onlineOnly, isDoctorOnline]);

  const filterTabs = ['All', ...SPECIALITIES];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Find specialists</Text>
          <Text style={styles.countText}>{filteredDoctors.length} matched</Text>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={COLORS.inkMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by doctor name, speciality, or degree"
            placeholderTextColor={COLORS.inkMuted}
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.inkMuted} />
            </Pressable>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          <Pressable
            onPress={() => setOnlineOnly((v) => !v)}
            style={[styles.filterPill, onlineOnly && styles.filterPillGreen]}
          >
            <View
              style={[
                styles.liveDot,
                { backgroundColor: onlineOnly ? '#FFFFFF' : COLORS.vitalGreen },
              ]}
            />
            <Text style={[styles.filterText, onlineOnly && { color: '#FFFFFF' }]}>
              Online now
            </Text>
          </Pressable>

          {filterTabs.map((spec) => {
            const active = selectedSpeciality.toLowerCase() === spec.toLowerCase();
            return (
              <Pressable
                key={spec}
                onPress={() => setSelectedSpeciality(spec)}
                style={[styles.filterPill, active && styles.filterPillActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {spec}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filteredDoctors}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={doctorsLoading}
            onRefresh={getDoctorsData}
            tintColor={COLORS.cobalt}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="search-outline" size={32} color={COLORS.inkMuted} />
            <Text style={styles.emptyTitle}>No specialists match these filters</Text>
            <Text style={styles.emptyBody}>
              Clear your search term or turn off the online filter to view all registered doctors.
            </Text>
            <Pressable
              onPress={() => {
                setSearchQuery('');
                setSelectedSpeciality('All');
                setOnlineOnly(false);
              }}
              style={styles.resetBtn}
            >
              <Text style={styles.resetBtnText}>Reset filters</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => {
          const online = isDoctorOnline(item._id);
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <DoctorAvatar uri={item.image} name={item.name} size={62} online={online} />
                <View style={styles.cardInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.docName} numberOfLines={1}>
                      {formatDoctorName(item.name)}
                    </Text>
                    <Ionicons name="checkmark-circle" size={16} color={COLORS.cobalt} />
                  </View>
                  <Text style={styles.docSpec}>{item.speciality}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaItem}>{item.degree}</Text>
                    <Text style={styles.metaItem}>{item.experience}</Text>
                  </View>
                </View>
              </View>

              {Boolean(item.about) && (
                <Text style={styles.aboutText} numberOfLines={2}>
                  {item.about}
                </Text>
              )}

              <View style={styles.cardFooter}>
                <View style={styles.footerLeft}>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: item.available
                          ? COLORS.vitalGreenSoft
                          : COLORS.surfaceMuted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        { color: item.available ? COLORS.vitalGreen : COLORS.inkMuted },
                      ]}
                    >
                      {online ? 'Online now' : item.available ? 'Available' : 'Unavailable'}
                    </Text>
                  </View>
                  <Text style={styles.feeText}>
                    {currencySymbol}
                    {item.fees} fee
                  </Text>
                </View>

                <Pressable
                  onPress={() => router.push(`/doctor/${item._id}` as any)}
                  style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.88 }]}
                >
                  <Text style={styles.ctaText}>Select time slot</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.canvas,
  },
  header: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    gap: SPACING.md,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.ink,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkMuted,
    fontVariant: ['tabular-nums'],
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.ink,
  },
  filtersRow: {
    gap: 8,
    paddingRight: SPACING.md,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterPillActive: {
    backgroundColor: COLORS.cobalt,
    borderColor: COLORS.cobalt,
  },
  filterPillGreen: {
    backgroundColor: COLORS.vitalGreen,
    borderColor: COLORS.vitalGreen,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkSecondary,
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  cardTop: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  docName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.ink,
    flexShrink: 1,
  },
  docSpec: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.cobalt,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  metaItem: {
    fontSize: 12,
    color: COLORS.inkSecondary,
  },
  aboutText: {
    fontSize: 13,
    color: COLORS.inkSecondary,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  feeText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  ctaBtn: {
    backgroundColor: COLORS.cobalt,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.ink,
  },
  emptyBody: {
    fontSize: 13,
    color: COLORS.inkSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  resetBtn: {
    marginTop: 6,
    backgroundColor: COLORS.ink,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
  },
  resetBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
