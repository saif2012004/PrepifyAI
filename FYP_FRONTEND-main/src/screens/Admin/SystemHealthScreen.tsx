import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Activity,
  Database,
  Server,
  HardDrive,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react-native';
import { FadeIn, AnimatedProgressBar } from '../../components/animated';

const systemStatus = {
  status: 'healthy',
  uptime: 99.9,
  apiResponseTime: 245,
  databaseStatus: 'connected',
  aiModelStatus: 'active',
  storageUsed: 45,
  storageTotal: 100,
  activeUsers: 1284,
  queuedJobs: 12,
};

const logs = [
  {
    id: 1,
    timestamp: '2024-01-15 14:35:22',
    level: 'info',
    message: 'AI model prediction completed',
    source: 'AI Engine',
  },
  {
    id: 2,
    timestamp: '2024-01-15 14:30:15',
    level: 'warning',
    message: 'High memory usage detected (85%)',
    source: 'System Monitor',
  },
  {
    id: 3,
    timestamp: '2024-01-15 14:25:08',
    level: 'info',
    message: 'Backup completed successfully',
    source: 'Backup Service',
  },
  {
    id: 4,
    timestamp: '2024-01-15 14:20:45',
    level: 'error',
    message: 'Failed to connect to external service',
    source: 'Integration Service',
  },
];

export default function SystemHealthScreen() {
  const router = useRouter();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push('/admin/dashboard');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <ArrowLeft size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>System Health</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Overall Status */}
          <FadeIn delay={60} direction="up" distance={16} style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <View style={styles.statusIndicator}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>System Operational</Text>
              </View>
              <CheckCircle size={24} color="#10B981" />
            </View>
            <Text style={styles.uptimeText}>
              Uptime: {systemStatus.uptime}% • Response Time: {systemStatus.apiResponseTime}ms
            </Text>
          </FadeIn>

          {/* Key Metrics */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Metrics</Text>
            <View style={styles.metricsGrid}>
              <FadeIn delay={120} direction="up" distance={14} style={styles.metricCardWrap}>
                <View style={styles.metricCard}>
                  <View style={[styles.metricIcon, { backgroundColor: '#DBEAFE' }]}>
                    <Server size={20} color="#2563EB" />
                  </View>
                  <Text style={styles.metricValue}>{systemStatus.apiResponseTime}ms</Text>
                  <Text style={styles.metricLabel}>Response</Text>
                </View>
              </FadeIn>

              <FadeIn delay={180} direction="up" distance={14} style={styles.metricCardWrap}>
                <View style={styles.metricCard}>
                  <View style={[styles.metricIcon, { backgroundColor: '#D1FAE5' }]}>
                    <Database size={20} color="#10B981" />
                  </View>
                  <Text style={styles.metricValue}>Connected</Text>
                  <Text style={styles.metricLabel}>Database</Text>
                </View>
              </FadeIn>

              <FadeIn delay={240} direction="up" distance={14} style={styles.metricCardWrap}>
                <View style={styles.metricCard}>
                  <View style={[styles.metricIcon, { backgroundColor: '#FEE2E2' }]}>
                    <Activity size={20} color="#EF4444" />
                  </View>
                  <Text style={styles.metricValue}>Active</Text>
                  <Text style={styles.metricLabel}>AI Model</Text>
                </View>
              </FadeIn>

              <FadeIn delay={300} direction="up" distance={14} style={styles.metricCardWrap}>
                <View style={styles.metricCard}>
                  <View style={[styles.metricIcon, { backgroundColor: '#E9D5FF' }]}>
                    <Users size={20} color="#8B5CF6" />
                  </View>
                  <Text style={styles.metricValue}>{systemStatus.activeUsers}</Text>
                  <Text style={styles.metricLabel}>Active Users</Text>
                </View>
              </FadeIn>
            </View>
          </View>

          {/* Storage Usage */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Storage Usage</Text>
            <View style={styles.card}>
              <View style={styles.storageHeader}>
                <HardDrive size={20} color="#6B7280" />
                <Text style={styles.storageText}>
                  {systemStatus.storageUsed}GB / {systemStatus.storageTotal}GB
                </Text>
              </View>
              <AnimatedProgressBar
                progress={systemStatus.storageUsed / systemStatus.storageTotal}
                height={8}
                color="#3B82F6"
                trackColor="#F3F4F6"
                style={{ marginBottom: 8 }}
              />
              <Text style={styles.storagePercentage}>
                {((systemStatus.storageUsed / systemStatus.storageTotal) * 100).toFixed(1)}% Used
              </Text>
            </View>
          </View>

          {/* System Logs */}
          <View style={styles.section}>
            <View style={styles.logsHeader}>
              <Text style={styles.sectionTitle}>System Logs</Text>
              <Clock size={18} color="#9CA3AF" />
            </View>
            <View style={styles.card}>
              {logs.map((log) => (
                <View key={log.id} style={styles.logItem}>
                  <View
                    style={[
                      styles.logIndicator,
                      {
                        backgroundColor:
                          log.level === 'error'
                            ? '#FEE2E2'
                            : log.level === 'warning'
                            ? '#FEF3C7'
                            : '#DBEAFE',
                      },
                    ]}
                  >
                    {log.level === 'error' ? (
                      <AlertTriangle size={14} color="#DC2626" />
                    ) : log.level === 'warning' ? (
                      <AlertTriangle size={14} color="#D97706" />
                    ) : (
                      <CheckCircle size={14} color="#2563EB" />
                    )}
                  </View>
                  <View style={styles.logContent}>
                    <View style={styles.logHeader}>
                      <Text style={styles.logLevel}>
                        {log.level.toUpperCase()}
                      </Text>
                      <Text style={styles.logTimestamp}>{log.timestamp}</Text>
                    </View>
                    <Text style={styles.logMessage}>{log.message}</Text>
                    <Text style={styles.logSource}>{log.source}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <TouchableOpacity style={styles.actionButton}>
              <Server size={20} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Restart Services</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]}>
              <Database size={20} color="#2563EB" />
              <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>
                Run Database Backup
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  statusCard: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#065F46',
  },
  uptimeText: {
    fontSize: 12,
    color: '#047857',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCardWrap: {
    flex: 1,
    minWidth: '45%',
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  metricIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  storageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  storageText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginLeft: 8,
  },
  storagePercentage: {
    fontSize: 12,
    color: '#6B7280',
  },
  logsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  logItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  logIndicator: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  logContent: {
    flex: 1,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  logLevel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  logTimestamp: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  logMessage: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  logSource: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  actionButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2563EB',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  actionButtonTextSecondary: {
    color: '#2563EB',
  },
});

