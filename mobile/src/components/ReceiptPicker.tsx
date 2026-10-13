import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { showAlert } from '../utils/alert';

interface ReceiptPickerProps {
  imageUri: string | null;
  onChange: (uri: string | null) => void;
}

export default function ReceiptPicker({ imageUri, onChange }: ReceiptPickerProps) {
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Brak uprawnień', 'Potrzebujemy dostępu do galerii, aby dodać paragon.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets?.length) {
      const asset = result.assets[0];
      const imageString = asset.base64
        ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`
        : asset.uri;
      onChange(imageString);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <TouchableOpacity style={styles.pickButton} onPress={pickImage}>
          <Text style={styles.pickText}>{imageUri ? '📷 Zmień zdjęcie' : '📷 Dodaj paragon'}</Text>
        </TouchableOpacity>
        {imageUri && (
          <TouchableOpacity style={styles.removeButton} onPress={() => onChange(null)}>
            <Text style={styles.removeText}>Usuń</Text>
          </TouchableOpacity>
        )}
      </View>
      {imageUri && (
        <View style={styles.previewWrapper}>
          <Image source={{ uri: imageUri }} style={styles.preview} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  pickButton: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 9,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569',
  },
  pickText: { color: '#38bdf8', fontSize: 13, fontWeight: '600' },
  removeButton: { paddingVertical: 9, paddingHorizontal: 12, backgroundColor: '#ef444420', borderRadius: 6 },
  removeText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },
  previewWrapper: { marginTop: 8, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
  preview: { width: '100%', height: 160, resizeMode: 'cover', borderRadius: 8 },
});
