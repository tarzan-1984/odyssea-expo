import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, rem } from '@/lib';
import type { MarkdownWrapKind } from '@/utils/chatMarkdown';
import type { EditorFormatState } from '@/utils/chatRichEditor';

export type ChatFormatAction = { type: 'wrap'; kind: MarkdownWrapKind };

type Props = {
  disabled?: boolean;
  activeFormats: EditorFormatState;
  onAction: (action: ChatFormatAction) => void;
};

function ToolbarButton({
  name,
  active,
  disabled,
  onPress,
}: {
  name: keyof typeof Feather.glyphMap;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.button, active && styles.buttonActive, disabled && styles.buttonDisabled]}
    >
      <Feather
        name={name}
        size={rem(16)}
        color={active ? colors.primary.violet : colors.primary.greyIcon}
      />
    </TouchableOpacity>
  );
}

export default function ChatFormatToolbar({ disabled, activeFormats, onAction }: Props) {
  return (
    <View style={styles.row}>
      <ToolbarButton
        name="bold"
        active={activeFormats.bold}
        disabled={disabled}
        onPress={() => onAction({ type: 'wrap', kind: 'bold' })}
      />
      <ToolbarButton
        name="italic"
        active={activeFormats.italic}
        disabled={disabled}
        onPress={() => onAction({ type: 'wrap', kind: 'italic' })}
      />
      <ToolbarButton
        name="underline"
        active={activeFormats.underline}
        disabled={disabled}
        onPress={() => onAction({ type: 'wrap', kind: 'underline' })}
      />
      <TouchableOpacity
        onPress={() => onAction({ type: 'wrap', kind: 'strike' })}
        disabled={disabled}
        activeOpacity={0.7}
        style={[
          styles.button,
          activeFormats.strikeThrough && styles.buttonActive,
          disabled && styles.buttonDisabled,
        ]}
      >
        <MaterialCommunityIcons
          name="format-strikethrough"
          size={rem(18)}
          color={activeFormats.strikeThrough ? colors.primary.violet : colors.primary.greyIcon}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rem(4),
    paddingBottom: rem(8),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(96, 102, 197, 0.2)',
    marginBottom: rem(8),
  },
  button: {
    width: rem(32),
    height: rem(32),
    borderRadius: rem(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonActive: {
    backgroundColor: 'rgba(96, 102, 197, 0.15)',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
