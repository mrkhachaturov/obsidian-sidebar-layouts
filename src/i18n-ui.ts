/*
 * Sidebar Layouts - Plugin for Obsidian
 * Copyright (c) 2026 Ruben Khachaturov
 * SPDX-License-Identifier: MIT
 */

/** English templates are also the fallback locale. Keep complete sentences for grammar. */
export const uiMessages = {
  'Left sidebar': 'Левая боковая панель',
  'Right sidebar': 'Правая боковая панель',
  'Left sidebar buttons': 'Кнопки левой боковой панели',
  'Right sidebar buttons': 'Кнопки правой боковой панели',
  'More sidebar buttons': 'Другие кнопки боковой панели',
  'Left sidebar button preview': 'Предпросмотр кнопок левой боковой панели',
  'Right sidebar button preview': 'Предпросмотр кнопок правой боковой панели',
  'Button position': 'Расположение кнопки',
  'In the window header': 'В верхней области окна',
  'Below panel tabs': 'Под вкладками панели',
  'Buttons below panel tabs hide with the sidebar.':
    'Кнопки под вкладками скрываются вместе с боковой панелью.',
  'Show when sidebar is closed': 'Показывать при закрытой боковой панели',
  'Keep this button in the window header when its sidebar is closed.':
    'Оставлять эту кнопку в верхней области окна, когда её боковая панель закрыта.',
  'Button preview': 'Предпросмотр кнопок',
  'Visible buttons, in sidebar order. Hidden buttons appear only in the list below.':
    'Видимые кнопки в порядке их расположения на боковой панели. Скрытые кнопки отображаются только в списке ниже.',
  'No buttons in the left sidebar yet. Save its current arrangement as a layout, or add a command shortcut.':
    'На левой боковой панели пока нет кнопок. Сохраните текущее расположение панелей как раскладку или добавьте кнопку команды.',
  'No buttons in the right sidebar yet. Save its current arrangement as a layout, or add a command shortcut.':
    'На правой боковой панели пока нет кнопок. Сохраните текущее расположение панелей как раскладку или добавьте кнопку команды.',
  'Updating buttons': 'Обновление кнопок',
  Buttons: 'Кнопки',
  'Save layouts and add shortcuts for this sidebar.':
    'Сохраняйте раскладки и добавляйте кнопки команд для этой боковой панели.',
  'Save current layout': 'Сохранить текущую раскладку',
  'Add command': 'Добавить команду',
  'Edit buttons': 'Редактировать кнопки',
  Name: 'Название',
  'Show button': 'Показывать кнопку',
  'When off, its command remains available if enabled.':
    'Если кнопка скрыта, её команда остаётся доступной, если она включена.',
  'Button removed': 'Кнопка удалена',
  Icon: 'Значок',
  Change: 'Изменить',
  'Saved layout': 'Сохранённая раскладка',
  'Save changes': 'Сохранить изменения',
  'Replace the saved layout with its current changes.':
    'Заменить сохранённую раскладку её текущим состоянием.',
  'Restore saved layout': 'Восстановить сохранённую раскладку',
  'Discard changes and return this sidebar to the saved arrangement.':
    'Отменить изменения и вернуть эту боковую панель к сохранённому расположению.',
  'Discard the changes remembered for this layout.':
    'Отменить изменения, запомненные для этой раскладки.',
  'Apply layout': 'Применить раскладку',
  'Switch the left sidebar to this layout, including changes remembered between switches.':
    'Применить к левой боковой панели эту раскладку, включая изменения, запомненные между переключениями.',
  'Switch the right sidebar to this layout, including changes remembered between switches.':
    'Применить к правой боковой панели эту раскладку, включая изменения, запомненные между переключениями.',
  Panels: 'Панели',
  'Add to the command palette': 'Добавить в палитру команд',
  'Off removes its command. It stays reachable from its button and from "Switch left sidebar layout".':
    'При выключении команда удаляется. Раскладка остаётся доступной через свою кнопку и команду «Переключить раскладку левой боковой панели».',
  'Off removes its command. It stays reachable from its button and from "Switch right sidebar layout".':
    'При выключении команда удаляется. Раскладка остаётся доступной через свою кнопку и команду «Переключить раскладку правой боковой панели».',
  'Full width for notes': 'Полная ширина для заметок',
  'Hide the panels below while a note is open at the top of the sidebar.':
    'Скрывать нижние панели, пока в верхней части боковой панели открыта заметка.',
  Appearance: 'Внешний вид',
  'Hide managed tabs': 'Скрывать вкладки управляемых панелей',
  'Hide the tabs of every panel your layouts control - the buttons replace them. Panels no layout mentions, such as a note you dragged in, keep their tab.':
    'Скрывать вкладки всех панелей, которыми управляют раскладки: их заменяют кнопки. Панели, не входящие ни в одну раскладку, например перетащенная заметка, сохраняют свои вкладки.',
  'Show tooltips': 'Показывать подсказки',
  'Show the button name when hovering it.': 'Показывать название кнопки при наведении.',
  Command: 'Команда',
  'Could not update buttons.': 'Не удалось обновить кнопки.',
  'Could not update buttons. Try again.': 'Не удалось обновить кнопки. Попробуйте ещё раз.',
  'Arrange buttons for the left sidebar. Changes are saved as you edit.':
    'Настройте кнопки левой боковой панели. Изменения сохраняются автоматически.',
  'Arrange buttons for the right sidebar. Changes are saved as you edit.':
    'Настройте кнопки правой боковой панели. Изменения сохраняются автоматически.',
  'No buttons yet. Save the current left sidebar layout, or add a command shortcut.':
    'Кнопок пока нет. Сохраните текущую раскладку левой боковой панели или добавьте кнопку команды.',
  'No buttons yet. Save the current right sidebar layout, or add a command shortcut.':
    'Кнопок пока нет. Сохраните текущую раскладку правой боковой панели или добавьте кнопку команды.',
  'Move {name}': 'Переместить {name}',
  'Name of {name}': 'Название кнопки {name}',
  'Move {name} up': 'Переместить {name} вверх',
  'Move {name} down': 'Переместить {name} вниз',
  'Delete {name}': 'Удалить {name}',
  'Search icons': 'Поиск значков',
  'Choose a command': 'Выберите команду',
  'Save left sidebar layout': 'Сохранить раскладку левой боковой панели',
  'Save right sidebar layout': 'Сохранить раскладку правой боковой панели',
  '{side} · Captured arrangement, top to bottom':
    '{side} · Зафиксированное расположение сверху вниз',
  'No panels in this sidebar.': 'На этой боковой панели нет панелей.',
  'Layout name': 'Название раскладки',
  'Layout icon: {icon}': 'Значок раскладки: {icon}',
  'Change icon': 'Изменить значок',
  Cancel: 'Отмена',
  'Save layout': 'Сохранить раскладку',
  'Enter a layout name.': 'Введите название раскладки.',
  Note: 'Заметка',
  Empty: 'Пусто',
  Layout: 'Раскладка',
  Hidden: 'Скрыта',
  Modified: 'Изменена',
  'No visible buttons': 'Нет видимых кнопок',
  'File explorer': 'Файлы',
  Search: 'Поиск',
  Bookmarks: 'Закладки',
  Outline: 'Структура',
  Backlink: 'Обратные ссылки',
  'Outgoing link': 'Исходящие ссылки',
  Tag: 'Теги',
  'File properties': 'Свойства файла',
  'All properties': 'Все свойства',
  '{count} layout': '{count} раскладка',
  '{count} layouts': {
    one: '{count} раскладка',
    few: '{count} раскладки',
    many: '{count} раскладок',
    other: '{count} раскладки',
  },
  '{count} command': '{count} команда',
  '{count} commands': {
    one: '{count} команда',
    few: '{count} команды',
    many: '{count} команд',
    other: '{count} команды',
  },
} as const;
