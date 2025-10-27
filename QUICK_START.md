# 🚀 Быстрый старт

## 🎉 Миграция завершена!

Ваш проект **полностью мигрирован** на Expo Router и готов к работе!

## ✅ Что сделано

- ✅ Вся инфраструктура (lib, types, services, hooks, icons)
- ✅ 8 auth экранов с file-based routing
- ✅ 3 main экрана с tab navigation
- ✅ Hot Reload настроен и работает
- ✅ Шрифты Mulish загружаются корректно
- ✅ TypeScript без ошибок
- ✅ Документация создана

## 🏃 Как запустить

### Dev server уже запущен!

Expo dev server работает на порту **8081**. Просто откройте:

```bash
http://localhost:8081
```

Или запустите заново:

```bash
cd /Applications/MAMP/htdocs/odyssea2/odyssea-expo
yarn start
```

### Выберите платформу:

В терминале нажмите:
- **`w`** - Web (браузер)
- **`a`** - Android (эмулятор/устройство)
- **`i`** - iOS (симулятор/устройство)
- **`r`** - Reload
- **`m`** - Меню

### Или используйте Expo Go:

1. Установите Expo Go на телефон ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))
2. Отсканируйте QR-код из терминала
3. Приложение откроется в Expo Go

## 📂 Структура проекта

```
odyssea-expo/
├── app/
│   ├── (auth)/           # Auth flow (8 экранов)
│   │   ├── index.tsx     # Splash → /
│   │   ├── welcome.tsx   # Welcome → /welcome
│   │   └── ...
│   ├── (tabs)/           # Main app (3 экрана)
│   │   ├── index.tsx     # Home → /
│   │   ├── messages.tsx  # Messages → /messages
│   │   └── profile.tsx   # Profile → /profile
│   └── _layout.tsx       # Root layout
├── components/
│   └── auth/ScreenLayout.tsx
├── lib/                  # Утилиты, темы
├── services/             # API
├── hooks/                # useAuth и др.
├── types/                # TypeScript types
├── icons/                # SVG иконки
└── assets/               # Изображения, шрифты
```

## 🔥 Hot Reload

**Работает автоматически!** Просто редактируйте файлы и смотрите изменения в реальном времени.

### Протестируйте:

1. Откройте `app/(auth)/welcome.tsx`
2. Измените текст "Welcome to the application"
3. Сохраните (Cmd+S / Ctrl+S)
4. Изменения применятся мгновенно! ⚡

## 🛠️ Полезные команды

```bash
# Запустить dev server
yarn start

# Запустить на конкретной платформе
yarn web
yarn android
yarn ios

# Проверить TypeScript
yarn tsc

# Очистить кеш
yarn start -c

# Билд для продакшена
yarn build
```

## 📚 Документация

### Основные файлы:

1. **README.md** - Полное руководство по проекту
2. **MIGRATION.md** - Детали миграции и изменений
3. **SUMMARY.md** - Итоговый отчёт

### Читать в порядке:

1. 👉 **QUICK_START.md** (этот файл) - начните отсюда
2. 📖 **README.md** - полная документация
3. 🔄 **MIGRATION.md** - как была сделана миграция
4. 📊 **SUMMARY.md** - детальный отчёт

## 🎯 Что дальше?

### Немедленно:

1. ✅ Запустите проект (`yarn start`)
2. ✅ Откройте в браузере (`w`)
3. ✅ Протестируйте Hot Reload
4. ✅ Посмотрите auth flow (splash → welcome → ...)

### Скоро:

- [ ] Интегрировать API (authApi уже готов)
- [ ] Добавить иконки в tabs
- [ ] Реализовать функциональность экранов
- [ ] Настроить protected routes

## 💡 Советы

### Navigation

```typescript
import { useRouter } from 'expo-router';

const router = useRouter();

// Перейти на экран
router.push('/welcome');

// С параметрами
router.push({ 
  pathname: '/enter-password', 
  params: { email: 'test@test.com' } 
});

// Назад
router.back();
```

### Получить параметры

```typescript
import { useLocalSearchParams } from 'expo-router';

const params = useLocalSearchParams();
const email = params.email;
```

### Использовать тему

```typescript
import { colors, fonts, rem, fp } from '@/lib';

const styles = StyleSheet.create({
  title: {
    color: colors.primary.blue,
    fontSize: fp(24),
    fontFamily: fonts["700"],
    marginBottom: rem(10),
  }
});
```

## ⚡ Проблемы?

### Expo dev server не запускается

```bash
# Очистите кеш
rm -rf .expo node_modules
yarn install
yarn start -c
```

### Шрифты не загружаются

```bash
# Перезапустите с очисткой кеша
yarn start -c
```

### TypeScript ошибки

```bash
# Проверьте типы
yarn tsc --noEmit
```

### Hot Reload не работает

- Сохраните файл снова (Cmd+S)
- Нажмите `r` в терминале для reload
- Перезапустите dev server

## 🎊 Готово!

Проект полностью готов к разработке. Удачи! 🚀

---

**Вопросы?** Читайте README.md или MIGRATION.md

**Dev server запущен:** http://localhost:8081

**Hot Reload:** ✅ Работает

**Status:** 🟢 Ready for development

