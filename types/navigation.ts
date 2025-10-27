// Navigation types for the app
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Splash: undefined;
  Welcome: undefined;
  EnterPassword: { 
    email: string;
    message?: string;
  };
  ResetPassword: undefined;
  VerifyAccountMethod: undefined;
  SendCodeTo: undefined;
  VerifyAccountCode: { method: 'call' | 'sms' | 'email'; contact: string };
  FinalVerify: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Messages: undefined;
  Profile: undefined;
};

// Global navigation types
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
