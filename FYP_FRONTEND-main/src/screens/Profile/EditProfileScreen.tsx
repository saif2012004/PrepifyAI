import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import InputField from '../../components/InputField';
import PrimaryButton from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [studentClass, setStudentClass] = useState(user?.class || '');
  const [instituteName, setInstituteName] = useState(user?.instituteName || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    if (!email.trim()) {
      Alert.alert('Error', 'Email is required');
      return;
    }

    setLoading(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    updateProfile({
      name: name.trim(),
      email: email.trim(),
      class: studentClass.trim(),
      instituteName: instituteName.trim(),
    });

    setLoading(false);
    Alert.alert('Success', 'Profile updated successfully!', [
      {
        text: 'OK',
        onPress: () => router.back(),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <ArrowLeft size={24} color="#111827" strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.form}>
            <InputField
              label="Full Name"
              value={name}
              onChangeText={setName}
              placeholder="Enter your full name"
              autoComplete="off"
              textContentType="none"
            />

            <InputField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoComplete="off"
              textContentType="none"
            />

            <InputField
              label="Class"
              value={studentClass}
              onChangeText={setStudentClass}
              placeholder="e.g., 12th Grade, FSc Pre-Medical"
              autoComplete="off"
              textContentType="none"
            />

            <InputField
              label="Institute Name"
              value={instituteName}
              onChangeText={setInstituteName}
              placeholder="Enter your school/college name"
              autoComplete="off"
              textContentType="none"
            />

            <View style={styles.buttonContainer}>
              <PrimaryButton
                title="Save Changes"
                onPress={handleSave}
                loading={loading}
                color="#2563EB"
              />
            </View>

            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
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
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  form: {
    padding: 24,
  },
  buttonContainer: {
    marginTop: 8,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 12,
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
});
