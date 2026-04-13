import { Text, TextInput } from 'react-native';

/**
 * Typography sizes come from fp() / theme only.
 * Do not apply OS display-size / accessibility font scale on top of those values.
 *
 * RN typings omit `defaultProps` on Text/TextInput, but the runtime object still accepts it.
 */
type ComponentWithDefaultProps = {
  defaultProps?: Record<string, unknown>;
};

const RNText = Text as typeof Text & ComponentWithDefaultProps;
const RNTextInput = TextInput as typeof TextInput & ComponentWithDefaultProps;

const textDefaults = RNText.defaultProps ?? {};
RNText.defaultProps = {
  ...textDefaults,
  allowFontScaling: false,
};

const inputDefaults = RNTextInput.defaultProps ?? {};
RNTextInput.defaultProps = {
  ...inputDefaults,
  allowFontScaling: false,
};
