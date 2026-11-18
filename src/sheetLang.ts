/*
 * The Google Sheet's words in every app language: column headings, category / kind / type labels
 * and the Summary tab. Tab names stay in English (see TABS in sheetLook.ts).
 * Terms follow the owner's "Maintenance Tables" templates on Google Drive.
 * Reading accepts a heading or label in ANY of these languages, so changing the app language is safe.
 */
import type { Category, ExpenseKind, Lang, VType } from './store'

export type Coll = 'vehicles' | 'service' | 'fuel' | 'schedule' | 'expenses'
type Heads = Record<Coll, Record<string, string>>

export const HEAD: Record<Lang, Heads> = {
  ru: {
    vehicles: { name: 'Название', type: 'Тип', currency: 'Валюта', odometer: 'Пробег (введён вручную)', color: 'Цвет', id: 'id' },
    service: { date: 'Дата', vehicle: 'Транспорт', odometer: 'Пробег, км', category: 'Категория', description: 'Описание работ / запчасти', tags: 'Теги', parts: 'Запчасти', labour: 'Работа', total: 'Итого', notes: 'Заметки', media: 'Фото и чеки', id: 'id' },
    fuel: { date: 'Дата', vehicle: 'Транспорт', odometer: 'Пробег, км', liters: 'Литры', total: 'Сумма', price_per_liter: 'Цена за литр', full_tank: 'Полный бак', missed_previous: 'Пропущена прошлая заправка', station: 'АЗС / заметка', id: 'id' },
    schedule: { vehicle: 'Транспорт', name: 'Узел', tag: 'Тег', interval_km: 'Интервал, км', interval_days: 'Интервал, дни', hint: 'Шпаргалка из мануала', id: 'id' },
    expenses: { date: 'Дата', vehicle: 'Транспорт', kind: 'Вид', amount: 'Сумма', note: 'Заметка', media: 'Фото и чеки', id: 'id' },
  },
  en: {
    vehicles: { name: 'Name', type: 'Type', currency: 'Currency', odometer: 'Odometer (entered by hand)', color: 'Colour', id: 'id' },
    service: { date: 'Date', vehicle: 'Vehicle', odometer: 'Odometer, km', category: 'Category', description: 'Work done / parts', tags: 'Tags', parts: 'Parts', labour: 'Labour', total: 'Total', notes: 'Notes', media: 'Photos and receipts', id: 'id' },
    fuel: { date: 'Date', vehicle: 'Vehicle', odometer: 'Odometer, km', liters: 'Litres', total: 'Total', price_per_liter: 'Price per litre', full_tank: 'Full tank', missed_previous: 'Missed previous fill-up', station: 'Station / note', id: 'id' },
    schedule: { vehicle: 'Vehicle', name: 'Item', tag: 'Tag', interval_km: 'Interval, km', interval_days: 'Interval, days', hint: 'Notes from the manual', id: 'id' },
    expenses: { date: 'Date', vehicle: 'Vehicle', kind: 'Type', amount: 'Amount', note: 'Note', media: 'Photos and receipts', id: 'id' },
  },
  uk: {
    vehicles: { name: 'Назва', type: 'Тип', currency: 'Валюта', odometer: 'Пробіг (введено вручну)', color: 'Колір', id: 'id' },
    service: { date: 'Дата', vehicle: 'Транспорт', odometer: 'Пробіг, км', category: 'Категорія', description: 'Опис робіт / запчастини', tags: 'Теги', parts: 'Вартість запчастин', labour: 'Робота', total: 'Разом', notes: 'Нотатки', media: 'Фото й чеки', id: 'id' },
    fuel: { date: 'Дата', vehicle: 'Транспорт', odometer: 'Пробіг, км', liters: 'Літри', total: 'Сума', price_per_liter: 'Ціна за літр', full_tank: 'Повний бак', missed_previous: 'Пропущено минулу заправку', station: 'АЗС / нотатка', id: 'id' },
    schedule: { vehicle: 'Транспорт', name: 'Вузол', tag: 'Тег', interval_km: 'Інтервал км', interval_days: 'Інтервал днів', hint: 'Сторінка мануала', id: 'id' },
    expenses: { date: 'Дата', vehicle: 'Транспорт', kind: 'Вид витрати', amount: 'Сума', note: 'Нотатка', media: 'Фото й чеки', id: 'id' },
  },
  et: {
    vehicles: { name: 'Nimi', type: 'Tüüp', currency: 'Valuuta', odometer: 'Läbisõit (sisestatud käsitsi)', color: 'Värv', id: 'id' },
    service: { date: 'Kuupäev', vehicle: 'Sõiduk', odometer: 'Läbisõit, km', category: 'Kategooria', description: 'Tööde kirjeldus / varuosad', tags: 'Sildid', parts: 'Varuosade hind', labour: 'Töötasu', total: 'Kokku', notes: 'Märkused', media: 'Fotod ja tšekid', id: 'id' },
    fuel: { date: 'Kuupäev', vehicle: 'Sõiduk', odometer: 'Läbisõit, km', liters: 'Liitrid', total: 'Summa', price_per_liter: 'Liitri hind', full_tank: 'Täis paak', missed_previous: 'Eelmine tankimine vahele jäänud', station: 'Tankla / märkus', id: 'id' },
    schedule: { vehicle: 'Sõiduk', name: 'Sõlm', tag: 'Silt', interval_km: 'Intervall km', interval_days: 'Intervall päeva', hint: 'Juhendi lehekülg', id: 'id' },
    expenses: { date: 'Kuupäev', vehicle: 'Sõiduk', kind: 'Kulu liik', amount: 'Summa', note: 'Märkus', media: 'Fotod ja tšekid', id: 'id' },
  },
  lv: {
    vehicles: { name: 'Nosaukums', type: 'Tips', currency: 'Valūta', odometer: 'Odometrs (ievadīts manuāli)', color: 'Krāsa', id: 'id' },
    service: { date: 'Datums', vehicle: 'Transportlīdzeklis', odometer: 'Odometrs, km', category: 'Kategorija', description: 'Darbu apraksts / detaļas', tags: 'Birkas', parts: 'Detaļu izmaksas', labour: 'Darbs', total: 'Kopā', notes: 'Piezīmes', media: 'Foto un čeki', id: 'id' },
    fuel: { date: 'Datums', vehicle: 'Transportlīdzeklis', odometer: 'Odometrs, km', liters: 'Litri', total: 'Summa', price_per_liter: 'Litra cena', full_tank: 'Pilna tvertne', missed_previous: 'Izlaista iepriekšējā uzpilde', station: 'DUS / piezīme', id: 'id' },
    schedule: { vehicle: 'Transportlīdzeklis', name: 'Mezgls', tag: 'Birka', interval_km: 'Intervāls km', interval_days: 'Intervāls dienas', hint: 'Rokasgrāmatas lappuse', id: 'id' },
    expenses: { date: 'Datums', vehicle: 'Transportlīdzeklis', kind: 'Izdevumu veids', amount: 'Summa', note: 'Piezīme', media: 'Foto un čeki', id: 'id' },
  },
  lt: {
    vehicles: { name: 'Pavadinimas', type: 'Tipas', currency: 'Valiuta', odometer: 'Odometras (įvestas rankiniu būdu)', color: 'Spalva', id: 'id' },
    service: { date: 'Data', vehicle: 'Transporto priemonė', odometer: 'Odometras, km', category: 'Kategorija', description: 'Darbų aprašymas / dalys', tags: 'Žymos', parts: 'Dalių kaina', labour: 'Darbo kaina', total: 'Iš viso', notes: 'Pastabos', media: 'Nuotraukos ir čekiai', id: 'id' },
    fuel: { date: 'Data', vehicle: 'Transporto priemonė', odometer: 'Odometras, km', liters: 'Litrai', total: 'Suma', price_per_liter: 'Litro kaina', full_tank: 'Pilnas bakas', missed_previous: 'Praleistas ankstesnis pylimas', station: 'Degalinė / pastaba', id: 'id' },
    schedule: { vehicle: 'Transporto priemonė', name: 'Mazgas', tag: 'Žyma', interval_km: 'Intervalas, km', interval_days: 'Intervalas, dienos', hint: 'Instrukcijos puslapis', id: 'id' },
    expenses: { date: 'Data', vehicle: 'Transporto priemonė', kind: 'Išlaidų rūšis', amount: 'Suma', note: 'Pastaba', media: 'Nuotraukos ir čekiai', id: 'id' },
  },
  pl: {
    vehicles: { name: 'Nazwa', type: 'Typ', currency: 'Waluta', odometer: 'Przebieg (wpisany ręcznie)', color: 'Kolor', id: 'id' },
    service: { date: 'Data', vehicle: 'Pojazd', odometer: 'Przebieg, km', category: 'Kategoria', description: 'Opis prac / części', tags: 'Tagi', parts: 'Koszt części', labour: 'Robocizna', total: 'Razem', notes: 'Notatki', media: 'Zdjęcia i paragony', id: 'id' },
    fuel: { date: 'Data', vehicle: 'Pojazd', odometer: 'Przebieg, km', liters: 'Litry', total: 'Kwota', price_per_liter: 'Cena za litr', full_tank: 'Pełny bak', missed_previous: 'Pominięte poprzednie tankowanie', station: 'Stacja / notatka', id: 'id' },
    schedule: { vehicle: 'Pojazd', name: 'Podzespół', tag: 'Tag', interval_km: 'Interwał km', interval_days: 'Interwał dni', hint: 'Strona instrukcji', id: 'id' },
    expenses: { date: 'Data', vehicle: 'Pojazd', kind: 'Rodzaj wydatku', amount: 'Kwota', note: 'Notatka', media: 'Zdjęcia i paragony', id: 'id' },
  },
}

export const CAT_L: Record<Category, Record<Lang, string>> = {
  service: { ru: 'ТО', en: 'Service', uk: 'ТО', et: 'Hooldus', lv: 'Apkope', lt: 'Techninė priežiūra', pl: 'Przegląd' },
  consumables: { ru: 'Расходники', en: 'Consumables', uk: 'Витратні матеріали', et: 'Kulumaterjalid', lv: 'Patēriņa materiāli', lt: 'Eksploatacinės medžiagos', pl: 'Materiały eksploatacyjne' },
  repair: { ru: 'Ремонт', en: 'Repair', uk: 'Ремонт', et: 'Remont', lv: 'Remonts', lt: 'Remontas', pl: 'Naprawa' },
  accessories: { ru: 'Аксессуары', en: 'Accessories', uk: 'Аксесуари', et: 'Lisavarustus', lv: 'Aksesuāri', lt: 'Priedai', pl: 'Akcesoria' },
}
export const KIND_L: Record<ExpenseKind, Record<Lang, string>> = {
  insurance: { ru: 'Страховка', en: 'Insurance', uk: 'Страховка', et: 'Kindlustus', lv: 'Apdrošināšana', lt: 'Draudimas', pl: 'Ubezpieczenie' },
  inspection: { ru: 'Техосмотр', en: 'Inspection', uk: 'Техогляд', et: 'Ülevaatus', lv: 'Tehniskā apskate', lt: 'Techninė apžiūra', pl: 'Przegląd techniczny' },
  tax: { ru: 'Налог', en: 'Tax', uk: 'Податок', et: 'Maks', lv: 'Nodoklis', lt: 'Mokestis', pl: 'Podatek' },
  fuel: { ru: 'Топливо', en: 'Fuel', uk: 'Пальне', et: 'Kütus', lv: 'Degviela', lt: 'Kuras', pl: 'Paliwo' },
  other: { ru: 'Прочее', en: 'Other', uk: 'Інше', et: 'Muu', lv: 'Cits', lt: 'Kita', pl: 'Inne' },
}
export const TYPE_L: Record<VType, Record<Lang, string>> = {
  moto: { ru: 'Мотоцикл', en: 'Motorcycle', uk: 'Мотоцикл', et: 'Mootorratas', lv: 'Motocikls', lt: 'Motociklas', pl: 'Motocykl' },
  car: { ru: 'Автомобиль', en: 'Car', uk: 'Автомобіль', et: 'Auto', lv: 'Automašīna', lt: 'Automobilis', pl: 'Samochód' },
}

/** Summary tab texts. */
export const SUM_T = {
  note: {
    ru: 'Эту вкладку собирает приложение Tolimoto Log. Правки здесь не сохраняются: меняйте данные на других вкладках.',
    en: 'This tab is built by the Tolimoto Log app. Edits here are not kept: change the data on the other tabs.',
    uk: 'Цю вкладку збирає застосунок Tolimoto Log. Зміни тут не зберігаються: редагуйте дані на інших вкладках.',
    et: 'Selle vahelehe koostab rakendus Tolimoto Log. Siinseid muudatusi ei säilitata: muuda andmeid teistel vahelehtedel.',
    lv: 'Šo cilni veido lietotne Tolimoto Log. Labojumi šeit netiek saglabāti: mainiet datus citās cilnēs.',
    lt: 'Šį skirtuką sudaro programėlė Tolimoto Log. Pakeitimai čia neišsaugomi: keiskite duomenis kituose skirtukuose.',
    pl: 'Tę kartę tworzy aplikacja Tolimoto Log. Zmiany tutaj nie są zapisywane: edytuj dane na pozostałych kartach.',
  },
  odo: { ru: 'Текущий пробег, км', en: 'Current odometer, km', uk: 'Поточний пробіг, км', et: 'Praegune läbisõit, km', lv: 'Pašreizējais odometrs, km', lt: 'Dabartinis odometras, km', pl: 'Aktualny przebieg, km' },
  sched: { ru: 'Регламент', en: 'Schedule', uk: 'Регламент', et: 'Hooldus', lv: 'Apkopes grafiks', lt: 'Priežiūros grafikas', pl: 'Przeglądy' },
  item: { ru: 'Узел', en: 'Item', uk: 'Вузол', et: 'Sõlm', lv: 'Mezgls', lt: 'Mazgas', pl: 'Podzespół' },
  tag: { ru: 'Тег', en: 'Tag', uk: 'Тег', et: 'Silt', lv: 'Birka', lt: 'Žyma', pl: 'Tag' },
  ikm: { ru: 'Интервал, км', en: 'Interval, km', uk: 'Інтервал км', et: 'Intervall km', lv: 'Intervāls km', lt: 'Intervalas, km', pl: 'Interwał km' },
  idays: { ru: 'Интервал, дни', en: 'Interval, days', uk: 'Інтервал днів', et: 'Intervall päeva', lv: 'Intervāls dienas', lt: 'Intervalas, dienos', pl: 'Interwał dni' },
  lkm: { ru: 'Последняя замена, км', en: 'Last done, km', uk: 'Остання заміна, одометр', et: 'Viimane vahetus, läbisõit', lv: 'Pēdējā maiņa, odometrs', lt: 'Paskutinis keitimas, odometras', pl: 'Ostatnia wymiana, przebieg' },
  ldate: { ru: 'Последняя замена, дата', en: 'Last done, date', uk: 'Остання заміна, дата', et: 'Viimane vahetus, kuupäev', lv: 'Pēdējā maiņa, datums', lt: 'Paskutinis keitimas, data', pl: 'Ostatnia wymiana, data' },
  rkm: { ru: 'Осталось, км', en: 'Left, km', uk: 'Залишилось км', et: 'Jäänud km', lv: 'Atlikuši km', lt: 'Liko km', pl: 'Pozostało km' },
  rdays: { ru: 'Осталось, дней', en: 'Left, days', uk: 'Залишилось днів', et: 'Jäänud päevi', lv: 'Atlikušas dienas', lt: 'Liko dienų', pl: 'Pozostało dni' },
  status: { ru: 'Статус', en: 'Status', uk: 'Статус', et: 'Olek', lv: 'Statuss', lt: 'Būsena', pl: 'Status' },
  hint: { ru: 'Шпаргалка', en: 'Notes', uk: 'Сторінка мануала', et: 'Juhendi lehekülg', lv: 'Rokasgrāmatas lappuse', lt: 'Instrukcijos puslapis', pl: 'Strona instrukcji' },
  spend: { ru: 'Траты по годам', en: 'Spending by year', uk: 'Витрати за роками', et: 'Kulud aastate kaupa', lv: 'Izdevumi pa gadiem', lt: 'Išlaidos pagal metus', pl: 'Wydatki według lat' },
  year: { ru: 'Год', en: 'Year', uk: 'Рік', et: 'Aasta', lv: 'Gads', lt: 'Metai', pl: 'Rok' },
  svc: { ru: 'ТО и ремонт', en: 'Service and repair', uk: 'ТО й ремонт', et: 'Hooldus ja remont', lv: 'Apkope un remonts', lt: 'Priežiūra ir remontas', pl: 'Przeglądy i naprawy' },
  acc: { ru: 'Аксессуары', en: 'Accessories', uk: 'Аксесуари', et: 'Lisavarustus', lv: 'Aksesuāri', lt: 'Priedai', pl: 'Akcesoria' },
  fuel: { ru: 'Топливо', en: 'Fuel', uk: 'Пальне', et: 'Kütus', lv: 'Degviela', lt: 'Kuras', pl: 'Paliwo' },
  other: { ru: 'Страховка и прочее', en: 'Insurance and other', uk: 'Страховка й інше', et: 'Kindlustus ja muu', lv: 'Apdrošināšana un cits', lt: 'Draudimas ir kita', pl: 'Ubezpieczenie i inne' },
  total: { ru: 'Итого', en: 'Total', uk: 'Разом', et: 'Kokku', lv: 'Kopā', lt: 'Iš viso', pl: 'Razem' },
  all: { ru: 'Всего', en: 'All years', uk: 'Усього', et: 'Kõik aastad', lv: 'Visi gadi', lt: 'Visi metai', pl: 'Wszystkie lata' },
  none: { ru: 'Нет записей', en: 'No records', uk: 'Немає записів', et: 'Kirjeid pole', lv: 'Nav ierakstu', lt: 'Nėra įrašų', pl: 'Brak wpisów' },
  over: { ru: 'Просрочено', en: 'Overdue', uk: 'Прострочено', et: 'Üle tähtaja', lv: 'Nokavēts', lt: 'Vėluoja', pl: 'Po terminie' },
  soon: { ru: 'Скоро', en: 'Soon', uk: 'Скоро', et: 'Varsti', lv: 'Drīz', lt: 'Greitai', pl: 'Wkrótce' },
  ok: { ru: 'Норма', en: 'OK', uk: 'Норма', et: 'Korras', lv: 'Kārtībā', lt: 'Tvarkoje', pl: 'OK' },
} as const satisfies Record<string, Record<Lang, string>>
