# Odyssea Mobile App (Expo Router)

Мобильное приложение Odyssea, полностью мигрированное на Expo Router.

## 🚀 Технологии

- **Expo SDK 52** - React Native framework
- **Expo Router** - File-based routing
- **TypeScript** - Type safety
- **React Hook Form** - Form validation
- **Yup** - Schema validation

## 📁 Структура проекта

```
odyssea-expo/
├── app/                    # Expo Router файловая маршрутизация
│   ├── (auth)/            # Auth flow (group без навигации в URL)
│   │   ├── _layout.tsx    # Auth stack layout
│   │   ├── index.tsx      # Splash screen
│   │   ├── welcome.tsx    # Welcome + email input
│   │   ├── enter-password.tsx
│   │   ├── reset-password.tsx
│   │   ├── verify-method.tsx
│   │   ├── send-code.tsx
│   │   ├── verify-code.tsx
│   │   └── final-verify.tsx
│   ├── (tabs)/            # Main app (tab navigation)
│   │   ├── _layout.tsx    # Tabs layout
│   │   ├── index.tsx      # Home screen
│   │   ├── messages.tsx   # Messages screen
│   │   └── profile.tsx    # Profile screen
│   └── _layout.tsx        # Root layout
├── components/            # Переиспользуемые компоненты
│   └── auth/
│       └── ScreenLayout.tsx
├── lib/                   # Утилиты, темы, конфиги
│   ├── api.ts
│   ├── colors.ts
│   ├── config.ts
│   ├── responsive.ts
│   └── theme.ts
├── services/              # API сервисы
│   └── authApi.ts
├── hooks/                 # Custom hooks
│   └── useAuth.ts
├── types/                 # TypeScript типы
│   ├── auth.ts
│   └── navigation.ts
├── icons/                 # SVG иконки
├── assets/                # Изображения, шрифты
│   ├── images/
│   └── fonts/
└── .env                   # Environment variables

```

## 🔧 Установка

1. **Установите зависимости:**

```bash
yarn install
```

2. **Настройте переменные окружения:**

Создайте файл `.env` в корне проекта:

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/v1
```

## 🏃 Запуск

### Development сервер

```bash
yarn start
```

Затем выберите платформу:
- Нажмите `w` для Web
- Нажмите `a` для Android
- Нажмите `i` для iOS
- Или отсканируйте QR-код в Expo Go

### Платформы

```bash
# Web
yarn web

# Android
yarn android

# iOS
yarn ios
```

## 📱 Маршрутизация (Expo Router)

### File-based routing

Expo Router использует файловую систему для определения маршрутов:

- `app/index.tsx` → `/`
- `app/(auth)/welcome.tsx` → `/welcome`
- `app/(tabs)/messages.tsx` → `/messages`

### Группы маршрутов

- `(auth)` - группа без отображения в URL
- `(tabs)` - группа с нижней навигацией

### Навигация в коде

```typescript
import { useRouter } from 'expo-router';

const router = useRouter();

// Push (добавить в stack)
router.push('/welcome');

// Replace (заменить текущий экран)
router.replace('/enter-password');

// Back
router.back();

// With params
router.push({
  pathname: '/enter-password',
  params: { email: 'user@example.com' }
});
```

### Получение параметров

```typescript
import { useLocalSearchParams } from 'expo-router';

const params = useLocalSearchParams();
const email = params.email;
```

## 🎨 Темизация

Проект использует централизованную систему стилей:

```typescript
import { colors, fonts, rem, fp, br } from '@/lib';

// Colors
colors.primary.blue
colors.neutral.white

// Fonts (Mulish 200-900)
fonts["700"] // Bold

// Responsive
rem(20)  // Responsive margin/padding
fp(16)   // Responsive font size
br(10)   // Border radius
```

## 🔐 Аутентификация

Auth flow реализован в `(auth)` группе:

1. **Splash** → 2s задержка
2. **Welcome** → ввод email
3. **EnterPassword** → ввод пароля
4. **VerifyCode** → ввод OTP
5. После успешной auth → redirect в `(tabs)`

## 🧪 Hot Module Replacement (HMR)

Expo Router поддерживает HMR из коробки:
- **Fast Refresh** - автоматическое обновление при изменении кода
- Сохранение state компонентов
- Instant feedback

## 📦 Билд для продакшена

```bash
# EAS Build (рекомендуется)
eas build --platform ios
eas build --platform android

# Local build
yarn build:ios
yarn build:android
```

## 🔍 Отладка

- **React DevTools**: автоматически доступны в dev режиме
- **Element Inspector**: Встряхните устройство → "Toggle Element Inspector"
- **Performance Monitor**: Встряхните устройство → "Show Performance Monitor"

## 📚 Полезные ссылки

- [Expo Router Docs](https://docs.expo.dev/router/introduction/)
- [Expo SDK](https://docs.expo.dev/)
- [React Native](https://reactnative.dev/)

## ✅ Статус миграции

- ✅ Этап 1: Infrastructure (lib, types, services, hooks, icons)
- ✅ Этап 2: Auth Flow (8 экранов)
- ✅ Этап 3: Main Screens (tabs)
- ✅ Этап 4: Testing & Hot Reload

## 🚧 TODO

- [ ] Добавить иконки в tab navigation
- [ ] Реализовать полную функциональность Home screen
- [ ] Реализовать полную функциональность Messages screen
- [ ] Реализовать полную функциональность Profile screen
- [ ] Настроить push notifications
- [ ] Добавить deep linking
- [ ] Написать E2E тесты

---

**Автор**: Odyssea Team  
**Лицензия**: Proprietary
