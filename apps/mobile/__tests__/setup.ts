// Tests never talk to a real server.
process.env.EXPO_PUBLIC_API_URL = 'http://test.invalid';

// Icon fonts are loaded asynchronously through expo-font, which has no asset registry under Jest.
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const Icon = ({ name }: { name: string }) => require('react').createElement(Text, { accessibilityElementsHidden: true }, '');
  return { Ionicons: Icon };
});
