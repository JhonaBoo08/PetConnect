import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackArrow, CheckIcon, PawIcon } from '@/components/app-icons';
import { BottomNav } from '@/components/bottom-nav';
import { Palette } from '@/constants/palette';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useFoundReports } from '@/lib/found-reports';
import { goBack } from '@/lib/navigation';

export default function FoundReportScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const idParam = Array.isArray(params.id) ? params.id[0] : (params.id ?? '');
  const reports = useFoundReports();
  const report = reports.find((r) => r.id === idParam) ?? null;

  if (!report) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack('/dashboard')}
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>
          </View>
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <PawIcon size={28} color={Palette.forestDark} />
            </View>
            <Text style={styles.emptyTitle}>Recovery report not found</Text>
            <Text style={styles.emptyText}>This recovery report is no longer available.</Text>
          </View>
          <BottomNav active="home" />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goBack('/dashboard')}
              style={styles.iconButton}>
              <BackArrow />
            </Pressable>
            <Text style={styles.topBarTitle}>Recovery report</Text>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <CheckIcon size={24} color={Palette.white} />
            </View>
            <Text style={styles.heroTitle}>{report.petName} may have been found</Text>
            <Text style={styles.heroText}>
              Someone scanned {report.petName}&apos;s Pet-Connect ID and reported finding the pet.
            </Text>
          </View>

          <Text style={styles.sectionLabel}>WHERE IT WAS FOUND</Text>
          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Found near</Text>
              <Text style={styles.detailValue}>{report.where}</Text>
            </View>
            {report.message ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Message</Text>
                <Text style={styles.detailValue}>{report.message}</Text>
              </View>
            ) : null}
            {report.photo ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Photo</Text>
                <Image source={{ uri: report.photo }} style={styles.reportPhoto} contentFit="cover" />
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionLabel}>PET ID</Text>
          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Pet-Connect ID</Text>
              <Text style={styles.detailValue}>{report.petId}</Text>
            </View>
          </View>
        </ScrollView>

        <BottomNav active="home" />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.cream,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: 32,
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  topBarTitle: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '800',
    color: Palette.forestDark,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    backgroundColor: Palette.forestDark,
    borderRadius: 16,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.five,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  heroTitle: {
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: '800',
    color: Palette.white,
    textAlign: 'center',
  },
  heroText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: '#D8E2D6',
    textAlign: 'center',
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: Palette.forestDark,
    marginTop: Spacing.five,
    marginBottom: Spacing.two,
  },
  detailCard: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  detailLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    color: Palette.inkMuted,
  },
  detailValue: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: Palette.forestDark,
    textAlign: 'right',
  },
  reportPhoto: {
    width: 96,
    height: 96,
    borderRadius: 12,
    backgroundColor: Palette.sage,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Palette.borderSoft,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '800',
    color: Palette.forestDark,
    marginTop: Spacing.four,
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: Palette.inkMuted,
    marginTop: Spacing.two,
  },
});