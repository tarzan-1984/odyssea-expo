# 🧭 Навигация в Expo Router

## 📋 Маршруты приложения

### Auth Flow (группа `(auth)`)

| Файл | Маршрут | Экран |
|------|---------|-------|
| `index.tsx` | `/` | Splash screen |
| `welcome.tsx` | `/welcome` | Email input |
| `enter-password.tsx` | `/enter-password` | Password input |
| `verify-code.tsx` | `/verify-code` | OTP code input |
| `reset-password.tsx` | `/reset-password` | Password reset |
| `verify-method.tsx` | `/verify-method` | 2FA method selection |
| `send-code.tsx` | `/send-code` | Choose code delivery |
| `final-verify.tsx` | `/final-verify` | Final verification |

### Main App (группа `(tabs)`)

| Файл | Маршрут | Экран |
|------|---------|-------|
| `index.tsx` | `/` | Home screen |
| `messages.tsx` | `/messages` | Messages |
| `profile.tsx` | `/profile` | Profile |

---

## 🎯 Как использовать навигацию

### 1. Базовая навигация

```typescript
import { useRouter } from 'expo-router';

const router = useRouter();

// Перейти на экран
router.push('/welcome');
router.push('/verify-code');

// Заменить текущий экран (без возможности вернуться)
router.replace('/enter-password');

// Вернуться назад
router.back();
```

### 2. Навигация с параметрами

```typescript
// Передать параметры
router.push({
  pathname: '/enter-password',
  params: { 
    email: 'user@example.com',
    message: 'Check your email'
  }
});

// Получить параметры на целевом экране
import { useLocalSearchParams } from 'expo-router';

const params = useLocalSearchParams();
const email = params.email;
const message = params.message;
```

### 3. Условная навигация

```typescript
// После успешного логина
if (result.success) {
  router.push({
    pathname: '/verify-code',
    params: { 
      method: 'email', 
      contact: userEmail 
    }
  });
} else {
  // Показать ошибку
  setError(result.error);
}
```

---

## ⚠️ Важные правила

### ✅ Правильно (kebab-case)

```typescript
router.push('/verify-code');        // ✅
router.push('/enter-password');     // ✅
router.push('/reset-password');     // ✅
router.push('/send-code');          // ✅
```

### ❌ Неправильно (PascalCase - старый стиль)

```typescript
router.push('/VerifyCode');         // ❌
router.push('/EnterPassword');      // ❌
router.push('/ResetPassword');      // ❌
router.push('/SendCode');           // ❌
```

### Почему так?

В Expo Router имя файла = маршрут:
- Файл: `verify-code.tsx` → Маршрут: `/verify-code`
- Файл: `enter-password.tsx` → Маршрут: `/enter-password`

---

## 🔄 Типичные сценарии

### Auth Flow

```typescript
// 1. Splash → Welcome (автоматически через 2 сек)
router.replace('/welcome');

// 2. Welcome → Enter Password
router.push({
  pathname: '/enter-password',
  params: { 
    email: email.trim(),
    message: result.data.message
  }
});

// 3. Enter Password → Verify Code
router.push({
  pathname: '/verify-code',
  params: { 
    method: 'email', 
    contact: userEmail 
  }
});

// 4. Verify Code → Final Verify (или Main App)
router.replace('/final-verify');
// или
router.replace('/(tabs)/');
```

### Reset Password Flow

```typescript
// Enter Password → Reset Password
router.push('/reset-password');

// Reset Password → Welcome
router.replace('/welcome');
```

---

## 🎨 Группы маршрутов

### (auth) - Auth Flow
Группа в скобках не добавляется в URL:
- Файл: `app/(auth)/welcome.tsx`
- URL: `localhost:8081/welcome` (не `/auth/welcome`)

### (tabs) - Main App
Группа с нижней навигацией:
- Файл: `app/(tabs)/messages.tsx`
- URL: `localhost:8081/messages` (не `/tabs/messages`)

---

## 🐛 Устранение проблем

### Ошибка "Unmatched Route"

**Проблема:** Видите ошибку "Page could not be found"

**Причины:**
1. Неправильный регистр (PascalCase вместо kebab-case)
2. Файл не существует
3. Опечатка в имени маршрута

**Решение:**
```typescript
// ❌ Неправильно
router.push('/VerifyAccountCode');

// ✅ Правильно
router.push('/verify-code');
```

### Параметры не доходят

**Проблема:** `params.email` is undefined

**Решение:**
```typescript
// Используйте useLocalSearchParams, не route.params
import { useLocalSearchParams } from 'expo-router';

const params = useLocalSearchParams();
const email = params.email; // ✅
```

---

## 📝 Checklist для добавления нового экрана

1. ✅ Создать файл в `app/(auth)/` или `app/(tabs)/`
2. ✅ Использовать kebab-case для имени файла
3. ✅ Импортировать `useRouter` и `useLocalSearchParams`
4. ✅ Использовать `router.push/replace/back` для навигации
5. ✅ Указывать маршруты в kebab-case
6. ✅ Проверить в браузере URL совпадает с именем файла

---

## 🎓 Дополнительно

### Type-safe Routes

Expo Router автоматически генерирует типы для маршрутов:

```typescript
// TypeScript подскажет доступные маршруты
router.push('/verify-code'); // ✅ автокомплит
router.push('/unknown');     // ❌ TypeScript ошибка
```

### Deep Linking

```typescript
// URL: odyssea://verify-code?email=test@test.com
// Автоматически откроет verify-code.tsx с параметром email
```

---

## 📚 Полезные ссылки

- [Expo Router Docs](https://docs.expo.dev/router/)
- [Navigation Reference](https://docs.expo.dev/router/reference/api/)
- [File-based Routing](https://docs.expo.dev/router/create-pages/)

---

**Последнее обновление:** 27 октября 2025  
**Статус:** ✅ Все маршруты работают корректно

