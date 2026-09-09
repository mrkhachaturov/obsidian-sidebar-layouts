/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

/** Plugin-owned runtime messages; user names and host errors remain unchanged. */
export const runtimeMessages = {
  'Registering command for "{name}"': 'Регистрация команды для «{name}»',
  '"{name}" is not available': 'Команда «{name}» недоступна',
  'Save changes': 'Сохранить изменения',
  'Restore saved layout': 'Восстановить сохранённую раскладку',
  'Show panel tabs': 'Показать вкладки панелей',
  'Hide panel tabs': 'Скрыть вкладки панелей',
  Delete: 'Удалить',
  'Updating sidebar': 'Обновление боковой панели',
  'Recording layout': 'Запись раскладки',
  'the left sidebar is empty, nothing to save': 'левая боковая панель пуста — сохранять нечего',
  'the right sidebar is empty, nothing to save': 'правая боковая панель пуста — сохранять нечего',
  'Switch left sidebar layout': 'Переключить раскладку левой боковой панели',
  'Switch right sidebar layout': 'Переключить раскладку правой боковой панели',
  'Switch left sidebar to which layout?': 'На какую раскладку переключить левую боковую панель?',
  'Switch right sidebar to which layout?': 'На какую раскладку переключить правую боковую панель?',
  'New layout from the left sidebar': 'Создать раскладку из левой боковой панели',
  'New layout from the right sidebar': 'Создать раскладку из правой боковой панели',
  'no layouts saved yet': 'сохранённых раскладок пока нет',
  'Invalid saved data; writes are disabled until the file is repaired and the plugin reloaded':
    'Сохранённые данные повреждены; запись отключена до исправления файла и перезагрузки плагина',
  'Loading layouts': 'Загрузка раскладок',
  'Loading layouts; writes are disabled until the plugin is reloaded':
    'Загрузка раскладок; запись отключена до перезагрузки плагина',
  'Saving layouts': 'Сохранение раскладок',
  'The source tab group cannot move leaves':
    'Исходная группа вкладок не поддерживает перемещение панелей',
  'The source tab group is no longer attached': 'Исходная группа вкладок больше не подключена',
} as const;
