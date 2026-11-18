import { useDB, type Lang, type VType } from './store'
import { uk } from './lang/uk'
import { et } from './lang/et'
import { lv } from './lang/lv'
import { lt } from './lang/lt'
import { pl } from './lang/pl'

/** The app's languages in menu order, by their own names. Same set as tolimoto.com. */
export const LANGS: { v: Lang; l: string }[] = [
  { v: 'en', l: 'English' },
  { v: 'ru', l: 'Русский' },
  { v: 'uk', l: 'Українська' },
  { v: 'et', l: 'Eesti' },
  { v: 'lv', l: 'Latviešu' },
  { v: 'lt', l: 'Lietuvių' },
  { v: 'pl', l: 'Polski' },
]

/** Locale for numbers, dates and times. */
export const LOCALE: Record<Lang, string> = { ru: 'ru-RU', en: 'en-GB', uk: 'uk-UA', et: 'et-EE', lv: 'lv-LV', lt: 'lt-LT', pl: 'pl-PL' }
/** Currency suggested for a new vehicle: złoty for Polish, hryvnia for Ukrainian, otherwise euro. */
export const defaultCurrency = (lang: Lang | null | undefined): string => (lang === 'pl' ? 'zł' : lang === 'uk' ? '₴' : '€')
export const locale = (lang: Lang | null | undefined): string => LOCALE[lang ?? 'ru'] ?? 'ru-RU'

/** Every string as [Russian, English]; the other languages live in src/lang/<code>.ts. */
export const S = {
  chooseLang: ['Выберите язык', 'Choose language'],
  savedLocal: ['Сохранено локально', 'Saved on device'],
  storageTemp: ['Хранилище недоступно: данные не сохранятся', 'Storage unavailable: data will not be kept'],
  tabHome: ['Гараж', 'Garage'],
  tabJournal: ['Журнал', 'Log'],
  tabSched: ['Регламент', 'Schedule'],
  tabStats: ['Статистика', 'Stats'],
  add: ['Добавить запись', 'Add record'],
  odometer: ['Одометр', 'Odometer'],
  km: ['км', 'km'],
  update: ['Обновить', 'Update'],
  fuel: ['Заправка', 'Fill-up'],
  work: ['Работа', 'Service'],
  expense: ['Расход', 'Expense'],
  odoUpdate: ['Пробег', 'Odometer'],
  upcoming: ['Ближайшие работы', 'Coming up'],
  allSched: ['Весь регламент', 'Full schedule'],
  noUpcoming: [
    'Появятся после первой записи с тегом узла.',
    'Shown after the first record tagged with a schedule item.',
  ],
  spent: ['Траты', 'Spent'],
  avgCons: ['Средний расход', 'Average consumption'],
  avgConsEmpty: ['появится после двух полных баков', 'appears after two full tanks'],
  l100: ['л/100 км', 'L/100 km'],
  ok: ['Норма', 'OK'],
  soon: ['Скоро', 'Soon'],
  over: ['Просрочено', 'Overdue'],
  none: ['Нет записей', 'No records'],
  left: ['осталось', 'left:'],
  overdueBy: ['просрочено на', 'overdue by'],
  days: ['дн', 'd'],
  addVehicle: ['Добавить транспорт', 'Add vehicle'],
  newVehicle: ['Новый транспорт', 'New vehicle'],
  editVehicle: ['Транспорт', 'Vehicle'],
  firstVehicle: ['Добавьте первый транспорт', 'Add your first vehicle'],
  name: ['Название', 'Name'],
  type: ['Тип', 'Type'],
  moto: ['Мотоцикл', 'Motorcycle'],
  car: ['Автомобиль', 'Car'],
  color: ['Цвет', 'Colour'],
  currency: ['Валюта', 'Currency'],
  curOdo: ['Текущий пробег, км', 'Current odometer, km'],
  preset: ['Регламент', 'Schedule'],
  presetTypical: ['Типовой набор', 'Typical set'],
  presetEmpty: ['Пустой', 'Empty'],
  presetNote: [
    'Интервалы типовые — сверьте со своим мануалом.',
    'Intervals are typical — check them against your manual.',
  ],
  save: ['Сохранить', 'Save'],
  delete: ['Удалить', 'Delete'],
  confirmDelete: ['Точно удалить?', 'Really delete?'],
  close: ['Закрыть', 'Close'],
  back: ['Назад', 'Back'],
  date: ['Дата', 'Date'],
  odoKm: ['Одометр, км', 'Odometer, km'],
  liters: ['Литры', 'Litres'],
  total: ['Сумма чека', 'Receipt total'],
  ppl: ['Цена за литр', 'Price per litre'],
  sumOrPrice: [
    'Введите сумму или цену — второе поле посчитается само.',
    'Enter the total or the price — the other one is calculated.',
  ],
  fullTank: ['Полный бак', 'Full tank'],
  missedFill: ['Пропустил прошлую заправку', 'Missed the previous fill-up'],
  station: ['АЗС / заметка', 'Station / note'],
  more: ['+ АЗС, пропуск заправки', '+ Station, missed fill-up'],
  prev: ['прошлый', 'previous'],
  segCons: ['Расход на отрезке', 'Consumption on this leg'],
  fuelPerKm: ['Топливо на 1 км', 'Fuel per km'],
  odoLower: ['Меньше текущего пробега этого транспорта.', 'Lower than this vehicle’s current odometer.'],
  looksLike: ['Похоже, это пробег другого транспорта:', 'This looks like the odometer of:'],
  switchTo: ['Переключить', 'Switch'],
  category: ['Категория', 'Category'],
  cat_service: ['ТО', 'Service'],
  cat_consumables: ['Расходники', 'Consumables'],
  cat_repair: ['Ремонт', 'Repair'],
  cat_accessories: ['Аксессуары', 'Accessories'],
  tags: ['Узлы и теги', 'Items and tags'],
  newTag: ['Свой тег', 'Custom tag'],
  description: ['Описание работ / запчасти', 'Work done / parts'],
  parts: ['Запчасти', 'Parts'],
  labour: ['Работа', 'Labour'],
  sum: ['Итого', 'Total'],
  notes: ['Заметки', 'Notes'],
  notesPh: ['Бренды, артикулы, номера счетов', 'Brands, part numbers, invoice numbers'],
  media: ['Ссылка на чек или фото', 'Link to receipt or photo'],
  odoOptional: ['Пробег, км (необязательно)', 'Odometer, km (optional)'],
  kind: ['Вид расхода', 'Expense type'],
  kind_insurance: ['Страховка', 'Insurance'],
  kind_inspection: ['Техосмотр', 'Inspection'],
  kind_tax: ['Налог', 'Tax'],
  kind_fuel: ['Топливо суммой', 'Fuel (lump sum)'],
  kind_other: ['Прочее', 'Other'],
  amount: ['Сумма', 'Amount'],
  note: ['Заметка', 'Note'],
  search: ['Поиск: работы, артикулы, заказы', 'Search: service, part numbers, orders'],
  all: ['Все', 'All'],
  fWork: ['Работы', 'Service'],
  fFuel: ['Заправки', 'Fill-ups'],
  fExp: ['Расходы', 'Expenses'],
  allYears: ['Все годы', 'All years'],
  allTags: ['Все теги', 'All tags'],
  emptyJournal: ['Записей пока нет.', 'No records yet.'],
  addItem: ['+ Узел', '+ Item'],
  editItem: ['Узел регламента', 'Schedule item'],
  itemName: ['Название узла', 'Item name'],
  tag: ['Тег', 'Tag'],
  intKm: ['Интервал, км', 'Interval, km'],
  intDays: ['Интервал, дни', 'Interval, days'],
  hint: ['Шпаргалка из мануала', 'Notes from the manual'],
  hintPh: ['Страница, объём, вязкость, артикул', 'Page, volume, viscosity, part number'],
  every: ['Каждые', 'Every'],
  or: ['или', 'or'],
  lastDone: ['Прошлая замена', 'Last done'],
  doneToday: ['Заменил сегодня', 'Done today'],
  history: ['История замен', 'History'],
  edit: ['Изменить', 'Edit'],
  emptySched: ['Узлов пока нет.', 'No schedule items yet.'],
  statsTotal: ['Всего', 'Total'],
  stService: ['ТО и ремонт', 'Service and repair'],
  stAcc: ['Аксессуары', 'Accessories'],
  stFuel: ['Топливо', 'Fuel'],
  stOther: ['Страховка, техосмотр, прочее', 'Insurance, inspection, other'],
  perKm: ['Стоимость 1 км', 'Cost per km'],
  perKmNote: ['за всё время, по пробегу из записей', 'all time, over the distance in the records'],
  consChart: ['Расход по отрезкам', 'Consumption by leg'],
  priceChart: ['Цена топлива', 'Fuel price'],
  noFuelStats: ['Графики появятся после нескольких заправок.', 'Charts appear after a few fill-ups.'],
  settings: ['Настройки', 'Settings'],
  language: ['Язык', 'Language'],
  theme: ['Тема', 'Theme'],
  thAuto: ['Как в системе', 'System'],
  thDark: ['Тёмная', 'Dark'],
  thLight: ['Светлая', 'Light'],
  startOnFuel: ['При запуске открывать Заправку', 'Open Fill-up on launch'],
  vehicles: ['Транспорт', 'Vehicles'],
  data: ['Данные', 'Data'],
  exportCsv: ['Экспорт CSV (архив)', 'Export CSV (archive)'],
  exportJson: ['Резервная копия JSON', 'JSON backup'],
  importJson: ['Импорт из JSON', 'Import from JSON'],
  imported: ['Импортировано записей:', 'Records imported:'],
  importErr: ['Не удалось прочитать файл.', 'Could not read the file.'],
  exportErr: ['Здесь сохранить файл не получилось.', 'Could not save the file here.'],
  installTitle: ['Установите на экран «Домой»', 'Add to Home Screen'],
  installText: [
    'В Safari: «Поделиться» → «На экран Домой». Записи надёжно хранятся только в установленном приложении, поэтому сделайте это до ввода данных.',
    'In Safari: Share → Add to Home Screen. Records are kept reliably only in the installed app, so do this before entering data.',
  ],
  gotIt: ['Понятно', 'Got it'],
  // first run: install
  inTitle: ['Установите приложение', 'Install the app'],
  inLead: ['Tolimoto Log работает как обычное приложение: с иконкой, на весь экран и без сети. Ничего не нужно скачивать из магазина.', 'Tolimoto Log works like a regular app: its own icon, full screen and offline. Nothing to download from a store.'],
  inIos1: ['Нажмите ≡ (три полоски) слева в адресной строке внизу. В старых версиях iOS этого шага нет — кнопка «Поделиться» сразу на панели.', 'Tap ≡ (three lines) on the left of the address bar at the bottom. Older iOS versions skip this — the Share button is right on the toolbar.'],
  inIos2: ['Нажмите «Поделиться», затем «На экран „Домой“» (если не видно — пролистайте вниз).', 'Tap Share, then “Add to Home Screen” (scroll down if you don’t see it).'],
  inIos3: ['Нажмите «Добавить» и откройте Tolimoto Log с иконки.', 'Tap “Add”, then open Tolimoto Log from its icon.'],
  inIosOther: ['Лучше всего установка работает из Safari: откройте app.tolimoto.com в Safari.', 'Installing works best from Safari: open app.tolimoto.com in Safari.'],
  inAnd1: ['Откройте меню Chrome — три точки справа вверху.', 'Open the Chrome menu — the three dots at the top right.'],
  inAnd2: ['Выберите «Установить приложение» или «Добавить на главный экран».', 'Choose “Install app” or “Add to Home screen”.'],
  inAnd3: ['Откройте Tolimoto Log с иконки.', 'Open Tolimoto Log from its icon.'],
  inDesk: ['На компьютере приложение работает прямо в браузере. Подключите Google — и записи будут общими с телефоном. Установить его как программу можно, но не обязательно.', 'On a computer the app works right in the browser. Connect Google and your records are shared with your phone. Installing it as an app is optional.'],
  inWhy: ['Записи, внесённые здесь, в браузере, не перейдут в установленное приложение. Поэтому сначала установите, потом записывайте.', 'Records entered here in the browser won’t carry over to the installed app. So install first, then log.'],
  inInstall: ['Установить', 'Install'],
  inGuide: ['Инструкция с картинками', 'Step-by-step guide'],
  inSkip: ['Продолжить в браузере', 'Continue in the browser'],
  // first run: tour
  tour1T: ['Заправка в одно касание', 'Fill-up in one tap'],
  tour1D: ['Главная кнопка на первом экране. Транспорт выбирается свайпом по карточке сверху.', 'The main button on the first screen. Swipe the card at the top to pick the vehicle.'],
  tour2T: ['Регламент сам считает', 'The schedule does the maths'],
  tour2D: ['Отмечайте работы тегами узлов, например #engineoil или #chain. Приложение подскажет, что и когда менять дальше.', 'Log work with item tags — #engineoil, #chain. The app tells you what is due next and when.'],
  tour3T: ['Расход и траты', 'Consumption and spending'],
  tour3D: ['Расход по каждой заправке, траты по годам и цена километра. Всё считается из ваших записей.', 'Consumption per fill-up, spending per year and the cost of a kilometre — all from your records.'],
  next: ['Дальше', 'Next'],
  skipTour: ['Пропустить', 'Skip'],
  // first run: where data lives
  stTitle: ['Где хранить ваши записи?', 'Where should your records live?'],
  stGoogleT: ['В вашем Google', 'In your Google account'],
  stGoogleD: ['Записи копируются в таблицу, а фото чеков — в папку на вашем Google Диске. Новый телефон — войдите, и всё вернётся.', 'Records are copied to a spreadsheet, receipt photos to a folder on your Google Drive. New phone — sign in and everything comes back.'],
  stRecommended: ['Рекомендуем', 'Recommended'],
  stGoogleBtn: ['Подключить Google', 'Connect Google'],
  stLocalT: ['Только на этом устройстве', 'Only on this device'],
  stLocalD: ['Если устройство потеряется, сломается или приложение удалят, записи пропадут. Раз в месяц напомним сделать резервную копию.', 'If the device is lost or broken, or the app is deleted, the records are gone. Once a month we will remind you to make a backup.'],
  stLocalAck: ['Понимаю: записи будут только на этом устройстве', 'I understand: records will be only on this device'],
  stLocalBtn: ['Продолжить без Google', 'Continue without Google'],
  stRestore: ['Восстановить из резервной копии (файл JSON)', 'Restore from a backup (JSON file)'],
  stRestored: ['Восстановлено записей:', 'Records restored:'],
  stLater: ['Google можно подключить позже в настройках.', 'You can connect Google later in Settings.'],
  // data safety
  dsTitle: ['Сохранность данных', 'Keeping your data safe'],
  dsGoogleOn: ['Записи синхронизируются с вашей таблицей Google. На новом телефоне установите приложение и войдите в тот же аккаунт — всё вернётся.', 'Records sync with your Google spreadsheet. On a new phone, install the app and sign in with the same account — everything comes back.'],
  dsLocal: ['Записи хранятся только в этом приложении на этом устройстве. Если устройство потеряется или приложение удалят, они пропадут.', 'Records are kept only in this app on this device. If the device is lost or the app is deleted, they are gone.'],
  dsHow: ['Как не потерять записи', 'How not to lose your records'],
  dsTip1: ['Подключите Google — это надёжнее всего.', 'Connect Google — the most reliable way.'],
  dsTip2: ['Или сохраняйте резервную копию: файл JSON в «Файлы» / iCloud Drive / Google Диск.', 'Or save a backup: a JSON file to Files / iCloud Drive / Google Drive.'],
  dsTip3: ['На новом телефоне: установите приложение → «Восстановить из резервной копии».', 'On a new phone: install the app → “Restore from a backup”.'],
  dsLast: ['Последняя копия', 'Last backup'],
  dsNever: ['ещё не делали', 'never'],
  dsBackup: ['Сохранить резервную копию', 'Save a backup'],
  dsMore: ['Подробнее о сохранности', 'More about keeping data safe'],
  brTitle: ['Пора сделать резервную копию', 'Time to make a backup'],
  brText: ['Записи хранятся только на этом устройстве. Сохраните копию — это минута.', 'Your records are only on this device. Save a copy — it takes a minute.'],
  colRecord: ['Запись', 'Record'],
  keysTitle: ['Горячие клавиши', 'Keyboard shortcuts'],
  keysHelp: ['N — новая запись, F — заправка, S — работа, E — расход, O — пробег. 1–\u20604 — вкладки, / — поиск в журнале. Ctrl+Enter (⌘+Enter) — сохранить, Esc — закрыть.', 'N — new record, F — fill-up, S — service, E — expense, O — odometer. 1–\u20604 — tabs, / — search the log. Ctrl+Enter (⌘+Enter) — save, Esc — close.'],
  brLater: ['Позже', 'Later'],
  brSave: ['Сохранить копию', 'Save a copy'],
  backupSaved: ['Резервная копия сохранена.', 'Backup saved.'],
  help: ['Как пользоваться', 'How to use'],
  version: ['Версия', 'Version'],
  googleLater: [
    'Вход через Google и синхронизация с таблицей появятся в следующей версии.',
    'Google sign-in and spreadsheet sync arrive in the next version.',
  ],
  move: ['Транспорт записи', 'Vehicle for this record'],
  dateFrom: ['С', 'From'],
  dateTo: ['По', 'To'],
  resetDates: ['Сбросить даты', 'Clear dates'],
  periodSpent: ['Траты за период', 'Spent in this period'],
  clearDate: ['Очистить дату', 'Clear date'],
  spentList: ['Траты', 'Spending'],
  allBuckets: ['Все статьи', 'All categories'],
  noSpend: ['Трат за этот период нет.', 'No spending in this period.'],
  consLow: ['ниже среднего', 'below average'],
  consHigh: ['выше среднего', 'above average'],
  avgFor: ['средний', 'average'],
  gTitle: ['Google Таблица и Диск', 'Google Sheet and Drive'],
  gNotConfigured: ['Вход через Google ещё не настроен в этой версии.', 'Google sign-in is not set up in this build yet.'],
  gIntro: [
    'Записи будут храниться и в вашей Google Таблице, а фото и чеки — в папке на вашем Диске. Приложение видит только файлы, которые создало само.',
    'Records are also kept in your Google Sheet, photos and receipts in a folder on your Drive. The app only sees files it created itself.',
  ],
  gSignIn: ['Войти через Google', 'Sign in with Google'],
  gSignInAgain: ['Войти снова', 'Sign in again'],
  gAccount: ['Аккаунт', 'Account'],
  gOpenSheet: ['Открыть таблицу', 'Open the sheet'],
  gOpenFolder: ['Открыть папку с чеками', 'Open the receipts folder'],
  gSyncNow: ['Синхронизировать сейчас', 'Sync now'],
  gDisconnect: ['Отключить Google на этом устройстве', 'Disconnect Google on this device'],
  gDisconnectNote: ['Записи останутся и здесь, и в таблице.', 'Records stay both here and in the sheet.'],
  sOff: ['Сохранено локально', 'Saved on device'],
  sSignin: ['Войдите снова для синхронизации', 'Sign in again to sync'],
  sSyncing: ['Синхронизация…', 'Syncing…'],
  sSynced: ['Синхронизировано', 'Synced'],
  sOffline: ['Нет сети — сохранено локально', 'Offline — saved on device'],
  sError: ['Ошибка синхронизации', 'Sync error'],
  sFromSheet: ['из таблицы', 'from the sheet'],
  sSkipped: ['Не прочитаны строки таблицы (нет транспорта, даты или суммы):', 'Sheet rows not read (no vehicle, date or amount):'],
  photos: ['Фото и чеки', 'Photos and receipts'],
  addPhoto: ['+ Фото или чек', '+ Photo or receipt'],
  uploading: ['Загружаю…', 'Uploading…'],
  photoN: ['Файл', 'File'],
  photoNeedsGoogle: ['Чтобы прикреплять фото, войдите через Google в настройках.', 'To attach photos, sign in with Google in Settings.'],
  photoNeedsSignin: ['Сеанс Google истёк: сохраните запись, нажмите «Войти снова» и добавьте фото.', 'The Google session expired: save the record, tap “Sign in again” and add the photo.'],
  photoOffline: ['Нет сети: фото можно добавить позже, открыв запись.', 'Offline: add the photo later by opening the record.'],
  photoError: ['Не удалось загрузить:', 'Upload failed:'],
  addLink: ['Добавить ссылку', 'Add link'],
  importFuelly: ['Импорт из Fuelly или Fuelio (CSV)', 'Import from Fuelly or Fuelio (CSV)'],
  fuelioCosts: ['расходов и работ', 'costs and jobs'],
  fuellyTitle: ['Импорт заправок', 'Import fill-ups'],
  fuellyRows: ['заправок', 'fill-ups'],
  fuellyTo: ['Куда добавить', 'Add to'],
  fuellyNew: ['Новый транспорт', 'New vehicle'],
  fuellySkip: ['Не импортировать', 'Skip'],
  fuellyMiles: ['Мили и галлоны пересчитаны в км и литры.', 'Miles and gallons converted to km and litres.'],
  fuellyGo: ['Импортировать', 'Import'],
  fuellyDone: ['Готово. Добавлено записей:', 'Done. Records added:'],
  fuellyUpdated: ['обновлено', 'updated'],
  fuellyLump: ['За этот год уже есть топливо общей суммой — оно посчитается дважды:', 'This year also has fuel as a lump sum — it would be counted twice:'],
  fuellyLumpDel: ['Удалить общую сумму', 'Delete the lump sum'],
  fuellyBad: ['Это не похоже на экспорт Fuelly или Fuelio.', 'This does not look like a Fuelly or Fuelio export.'],
  fromFuelly: ['по заправкам', 'from fill-ups'],
} as const satisfies Record<string, readonly [string, string]>

export type K = keyof typeof S

/** A language besides Russian and English: every string, plus the names of the preset schedule items by tag. */
export interface Pack { s: Record<K, string>; preset: Record<string, string> }
const PACKS: Partial<Record<Lang, Pack>> = { uk, et, lv, lt, pl }

export const tr = (lang: Lang | null, k: K): string => {
  if (!lang || lang === 'ru') return S[k][0]
  if (lang === 'en') return S[k][1]
  return PACKS[lang]?.s[k] ?? S[k][1]
}

/** Name of a preset schedule item in the given language. */
export const presetName = (p: { tag: string; name: [string, string] }, lang: Lang): string =>
  lang === 'ru' ? p.name[0] : lang === 'en' ? p.name[1] : PACKS[lang]?.preset[p.tag] ?? p.name[1]

export function useT() {
  const lang: Lang = useDB().settings.lang ?? 'ru'
  const loc = locale(lang)
  return {
    lang,
    t: (k: K) => tr(lang, k),
    /** Number for display. */
    n: (x: number, d = 0) => x.toLocaleString(loc, { minimumFractionDigits: d, maximumFractionDigits: d }),
    date: (s: string) => {
      const [y, m, d] = s.split('-')
      return `${d}.${m}.${y}`
    },
    /** Number as text for an input field. */
    inp: (x: number, d: number) => {
      const s = String(Number(x.toFixed(d)))
      return lang === 'en' ? s : s.replace('.', ',')
    },
  }
}

export const PRESETS: Record<VType, { tag: string; name: [string, string]; km: number | null; days: number | null }[]> = {
  moto: [
    { tag: 'engineoil', name: ['Масло двигателя', 'Engine oil'], km: 10000, days: 365 },
    { tag: 'oilfilter', name: ['Масляный фильтр', 'Oil filter'], km: 10000, days: 365 },
    { tag: 'airfilter', name: ['Воздушный фильтр', 'Air filter'], km: 20000, days: 730 },
    { tag: 'plugs', name: ['Свечи зажигания', 'Spark plugs'], km: 30000, days: null },
    { tag: 'valves', name: ['Регулировка клапанов', 'Valve clearance'], km: 24000, days: null },
    { tag: 'forkoil', name: ['Масло в вилке', 'Fork oil'], km: 30000, days: 730 },
    { tag: 'chain', name: ['Цепь и звёзды', 'Chain and sprockets'], km: 25000, days: null },
    { tag: 'coolant', name: ['Антифриз', 'Coolant'], km: null, days: 1095 },
    { tag: 'brakefluid', name: ['Тормозная жидкость', 'Brake fluid'], km: null, days: 730 },
  ],
  car: [
    { tag: 'engineoil', name: ['Масло двигателя', 'Engine oil'], km: 15000, days: 365 },
    { tag: 'oilfilter', name: ['Масляный фильтр', 'Oil filter'], km: 15000, days: 365 },
    { tag: 'airfilter', name: ['Воздушный фильтр', 'Air filter'], km: 30000, days: 730 },
    { tag: 'cabinfilter', name: ['Салонный фильтр', 'Cabin filter'], km: 15000, days: 365 },
    { tag: 'plugs', name: ['Свечи зажигания', 'Spark plugs'], km: 60000, days: null },
    { tag: 'gearoil', name: ['Масло в коробке', 'Gearbox oil'], km: 60000, days: null },
    { tag: 'coolant', name: ['Антифриз', 'Coolant'], km: null, days: 1825 },
    { tag: 'brakefluid', name: ['Тормозная жидкость', 'Brake fluid'], km: null, days: 730 },
  ],
}

/** Every name a preset item has had in any language, by tag. */
const PRESET_NAMES: Record<string, Set<string>> = {}
for (const p of [...PRESETS.moto, ...PRESETS.car]) {
  const set = (PRESET_NAMES[p.tag] ??= new Set())
  for (const l of ['ru', 'en', ...Object.keys(PACKS)] as Lang[]) set.add(presetName(p, l).toLowerCase())
}

/**
 * Renames schedule items that still carry a preset's name (in any language) to that preset's name
 * in `lang`, so "Масло двигателя" reads "Olej silnikowy" in Polish. Items the owner renamed are left alone.
 * Mutates the items; returns true if anything changed.
 */
export function relabelPresets(items: { tag: string; name: string }[], lang: Lang): boolean {
  let changed = false
  for (const it of items) {
    const p = [...PRESETS.moto, ...PRESETS.car].find((x) => x.tag === it.tag)
    if (!p || !PRESET_NAMES[it.tag]?.has(it.name.trim().toLowerCase())) continue
    const want = presetName(p, lang)
    if (it.name !== want) { it.name = want; changed = true }
  }
  return changed
}
