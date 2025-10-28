# 🎨 Использование SVG иконок в Expo

## ✅ Что установлено:

1. **`react-native-svg`** - базовая библиотека для рендеринга SVG
2. **`react-native-svg-transformer`** - автоматический импорт SVG файлов
3. **`metro.config.js`** - конфигурация для поддержки SVG
4. **`svg.d.ts`** - TypeScript типы для SVG

---

## 📝 Как использовать:

### **1. Импорт SVG файла:**

```typescript
import MyIcon from '@/assets/icons/my-icon.svg';

// Использование:
<MyIcon width={24} height={24} fill="#000" />
```

### **2. Пример компонента:**

```typescript
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import HomeIcon from '@/assets/icons/home.svg';
import { colors } from '@/lib';

export default function MyComponent() {
  return (
    <TouchableOpacity style={styles.button}>
      <HomeIcon 
        width={24} 
        height={24} 
        fill={colors.primary.blue} 
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 12,
  }
});
```

### **3. Динамические SVG:**

```typescript
import React from 'react';
import { SvgProps } from 'react-native-svg';

interface IconProps extends SvgProps {
  color?: string;
  size?: number;
}

export const MyIcon: React.FC<IconProps> = ({ 
  color = '#000', 
  size = 24,
  ...props 
}) => {
  return (
    <svg width={size} height={size} {...props}>
      <path fill={color} d="..." />
    </svg>
  );
};
```

---

## 🎯 Преимущества SVG:

| Характеристика | PNG/JPG | SVG |
|---------------|---------|-----|
| **Масштабируемость** | ❌ Пикселизация | ✅ Векторная |
| **Размер файла** | ⚠️ Крупный | ✅ Маленький |
| **Изменение цвета** | ❌ Нужен другой файл | ✅ Программно |
| **Retina/@2x/@3x** | ❌ Нужны разные файлы | ✅ Один файл |
| **Размытие** | ❌ Низкое качество | ✅ Четкое |

---

## 📁 Где хранить SVG:

```
assets/
  icons/
    home.svg
    settings.svg
    user.svg
    arrow-right.svg
    ...
```

---

## 🔧 Полезные пропы для SVG:

```typescript
<MyIcon 
  width={24}              // Ширина
  height={24}             // Высота
  fill="#000"             // Цвет заливки
  stroke="#fff"           // Цвет обводки
  strokeWidth={2}         // Толщина обводки
  opacity={0.5}           // Прозрачность
/>
```

---

## 🎨 Изменение цвета SVG:

```typescript
// Динамическое изменение цвета
const [iconColor, setIconColor] = useState('#000');

<MyIcon fill={iconColor} />

// Изменение цвета по темам
import { useColorScheme } from 'react-native';

const colorScheme = useColorScheme();
const iconColor = colorScheme === 'dark' ? '#fff' : '#000';

<MyIcon fill={iconColor} />
```

---

## ⚡ Примеры использования в проекте:

### **Навигационная иконка:**

```typescript
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import HomeIcon from '@/assets/icons/home.svg';
import { colors } from '@/lib';

export function HomeButton() {
  const router = useRouter();
  
  return (
    <TouchableOpacity onPress={() => router.push('/home')}>
      <HomeIcon 
        width={24} 
        height={24} 
        fill={colors.primary.blue} 
      />
    </TouchableOpacity>
  );
}
```

### **Иконка со статусом:**

```typescript
import OnlineIcon from '@/assets/icons/online.svg';

export function StatusIcon({ isOnline }: { isOnline: boolean }) {
  return (
    <OnlineIcon 
      width={12} 
      height={12} 
      fill={isOnline ? '#34C759' : '#8E8E93'} 
    />
  );
}
```

---

## 🐛 Troubleshooting:

### **1. SVG не отображается:**
```bash
# Перезапустить Metro bundler
yarn start --clear
```

### **2. TypeScript ошибки:**
```bash
# Проверить, что svg.d.ts на месте
```

### **3. SVG не масштабируется:**
```typescript
// Добавить viewBox к SVG:
<svg viewBox="0 0 24 24" ...>
```

---

## 📚 Документация:

- **react-native-svg**: https://github.com/react-native-svg/react-native-svg
- **svg-transformer**: https://github.com/kristerkari/react-native-svg-transformer

---

**Готово! Теперь можно использовать SVG иконки в приложении!** 🎉

