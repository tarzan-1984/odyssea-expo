import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors, rem } from '@/lib';
import { CHAT_RICH_EDITOR_HTML } from '@/components/chat/chatRichEditorHtml';
import {
  EMPTY_EDITOR_FORMAT_STATE,
  type EditorFormatCommand,
  type EditorFormatState,
} from '@/utils/chatRichEditor';

export type ChatRichComposeInputRef = {
  insertText: (text: string) => void;
  focus: () => void;
  clear: () => void;
  applyFormat: (command: EditorFormatCommand) => void;
};

type ChatRichComposeInputProps = {
  disabled?: boolean;
  resetKey?: number;
  onContentChange: (markdown: string, plainText: string) => void;
  onFormatStateChange?: (state: EditorFormatState) => void;
};

const ChatRichComposeInput = forwardRef<ChatRichComposeInputRef, ChatRichComposeInputProps>(
  function ChatRichComposeInput(
    { disabled = false, resetKey = 0, onContentChange, onFormatStateChange },
    ref
  ) {
    const webViewRef = useRef<WebView>(null);
    const [editorHeight, setEditorHeight] = useState(rem(36));
    const [ready, setReady] = useState(false);
    const prevResetKeyRef = useRef(resetKey);

    const runInEditor = useCallback((script: string) => {
      webViewRef.current?.injectJavaScript(`${script}; true;`);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        insertText: (text: string) => {
          const escaped = JSON.stringify(text);
          runInEditor(`window.insertTextAtSelection(${escaped})`);
        },
        focus: () => {
          runInEditor('document.getElementById("editor").focus()');
        },
        clear: () => {
          runInEditor('window.handleNativeCommand("clear")');
        },
        applyFormat: (command: EditorFormatCommand) => {
          const escaped = JSON.stringify(command);
          runInEditor(`window.handleNativeCommand(${escaped})`);
        },
      }),
      [runInEditor]
    );

    useEffect(() => {
      if (!ready) return;
      runInEditor(`window.setEditorEnabled(${disabled ? 'false' : 'true'})`);
    }, [disabled, ready, runInEditor]);

    useEffect(() => {
      if (resetKey === prevResetKeyRef.current) return;
      prevResetKeyRef.current = resetKey;
      if (!ready) return;
      runInEditor('window.handleNativeCommand("clear")');
      setEditorHeight(rem(36));
      onContentChange('', '');
      onFormatStateChange?.(EMPTY_EDITOR_FORMAT_STATE);
    }, [resetKey, ready, runInEditor, onContentChange, onFormatStateChange]);

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        try {
          const data = JSON.parse(event.nativeEvent.data) as {
            type?: string;
            html?: string;
            markdown?: string;
            plain?: string;
            height?: number;
            format?: EditorFormatState;
          };

          if (data.type === 'ready') {
            setReady(true);
            return;
          }

          if (data.type === 'format' && data.format) {
            onFormatStateChange?.(data.format);
            return;
          }

          if (data.type === 'change') {
            const markdown = data.markdown ?? '';
            const plain = data.plain ?? '';
            onContentChange(markdown, plain);
            if (typeof data.height === 'number' && Number.isFinite(data.height)) {
              setEditorHeight(data.height);
            }
            if (data.format) {
              onFormatStateChange?.(data.format);
            }
          }
        } catch {
          // Ignore malformed bridge messages
        }
      },
      [onContentChange, onFormatStateChange]
    );

    return (
      <View style={[styles.wrap, { height: editorHeight }]}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: CHAT_RICH_EDITOR_HTML }}
          onMessage={handleMessage}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView={Platform.OS === 'ios'}
          style={styles.webView}
          containerStyle={styles.webViewContainer}
          javaScriptEnabled
          domStorageEnabled
          nestedScrollEnabled
        />
      </View>
    );
  }
);

export default ChatRichComposeInput;

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: rem(36),
    maxHeight: rem(120),
    borderRadius: rem(15),
    borderWidth: 1,
    borderColor: 'rgba(96, 102, 197, 0.31)',
    backgroundColor: 'rgba(96, 102, 197, 0.1)',
    overflow: 'hidden',
  },
  webViewContainer: {
    backgroundColor: 'transparent',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
