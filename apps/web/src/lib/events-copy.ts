import type { EventLocale } from "@event-platform/shared-types";

// Current UI plus historical preview and lifecycle labels.
export const EVENTS_COPY = {
  "ru": {
    "loadFailed": "Не удалось загрузить мероприятия.",
    "previewFailed": "Не удалось загрузить предпросмотр.",
    "previewDraftBanner": "Предпросмотр — событие ещё не опубликовано",
    "previewPublishedBanner": "Предпросмотр опубликованного события",
    "previewCheckoutDisabled": "Это предпросмотр. Действия покупки отключены.",
    "deleteDraft": "Удалить черновик",
    "categories": {
      "music": "Музыка",
      "nightlife": "Ночная жизнь",
      "festival": "Фестиваль",
      "comedy": "Комедия и стендап",
      "theatre": "Театр",
      "business": "Бизнес",
      "education": "Образование",
      "workshop": "Мастер-класс",
      "sport": "Спорт",
      "family": "Для всей семьи",
      "food": "Еда и гастрономия",
      "other": "Другое"
    },
    "statuses": {
      "draft": "Черновик",
      "published": "Опубликовано",
      "cancelled": "Отменено",
      "completed": "Завершено"
    },
    "paymentModes": {
      "deposit": "Депозит",
      "full_payment": "Полная оплата"
    },
    "fields": {
      "description": "Описание",
      "program": "Программа",
      "rules": "Правила",
      "visitTerms": "Условия посещения",
      "cancellationTerms": "Условия отмены и возврата",
      "extraConditions": "Дополнительные условия",
      "depositTerms": "Условия депозита"
    },
    "errors": {
      "publishMissing": "Для публикации заполните обязательные поля",
      "notFound": "Мероприятие не найдено.",
      "invalidTransition": "Так изменить статус мероприятия нельзя.",
      "deleteNotAllowed": "Опубликованное мероприятие нельзя удалить безвозвратно.",
      "posterRequired": "Выберите файл постера.",
      "posterTooLarge": "Размер постера не должен превышать 5 МБ.",
      "posterTypeInvalid": "Постер должен быть корректным файлом JPEG, PNG или WebP."
    }
  },
  "kk": {
    "loadFailed": "Іс-шараларды жүктеу мүмкін болмады.",
    "previewFailed": "Алдын ала қарау жүктелмеді.",
    "previewDraftBanner": "Алдын ала қарау — іс-шара әлі жарияланбаған",
    "previewPublishedBanner": "Жарияланған іс-шараны алдын ала қарау",
    "previewCheckoutDisabled": "Бұл алдын ала қарау. Сатып алу әрекеттері өшірілген.",
    "deleteDraft": "Нобайды жою",
    "categories": {
      "music": "Музыка",
      "nightlife": "Түнгі өмір",
      "festival": "Фестиваль",
      "comedy": "Комедия және стендап",
      "theatre": "Театр",
      "business": "Бизнес",
      "education": "Білім",
      "workshop": "Шеберлік сабағы",
      "sport": "Спорт",
      "family": "Отбасылық",
      "food": "Тағам және гастрономия",
      "other": "Басқа"
    },
    "statuses": {
      "draft": "Нобай",
      "published": "Жарияланған",
      "cancelled": "Бас тартылған",
      "completed": "Аяқталған"
    },
    "paymentModes": {
      "deposit": "Депозит",
      "full_payment": "Толық төлем"
    },
    "fields": {
      "description": "Сипаттама",
      "program": "Бағдарлама",
      "rules": "Ережелер",
      "visitTerms": "Қатысу шарттары",
      "cancellationTerms": "Бас тарту және қайтару шарттары",
      "extraConditions": "Қосымша шарттар",
      "depositTerms": "Депозит шарттары"
    },
    "errors": {
      "publishMissing": "Жариялау үшін міндетті өрістерді толтырыңыз",
      "notFound": "Іс-шара табылмады.",
      "invalidTransition": "Іс-шара күйін бұлай өзгертуге болмайды.",
      "deleteNotAllowed": "Жарияланған іс-шараны біржола жоюға болмайды.",
      "posterRequired": "Постер файлын таңдаңыз.",
      "posterTooLarge": "Постер 5 МБ-тан аспауы керек.",
      "posterTypeInvalid": "Постер жарамды JPEG, PNG немесе WebP файлы болуы керек."
    }
  },
  "en": {
    "loadFailed": "Could not load events.",
    "previewFailed": "Could not load the preview.",
    "previewDraftBanner": "Preview — this event is not published yet",
    "previewPublishedBanner": "Preview of the published event",
    "previewCheckoutDisabled": "This is a preview. Purchases are disabled.",
    "deleteDraft": "Delete draft",
    "categories": {
      "music": "Music",
      "nightlife": "Nightlife",
      "festival": "Festival",
      "comedy": "Comedy and stand-up",
      "theatre": "Theatre",
      "business": "Business",
      "education": "Education",
      "workshop": "Workshop",
      "sport": "Sports",
      "family": "Family",
      "food": "Food and drink",
      "other": "Other"
    },
    "statuses": {
      "draft": "Draft",
      "published": "Published",
      "cancelled": "Cancelled",
      "completed": "Completed"
    },
    "paymentModes": {
      "deposit": "Deposit",
      "full_payment": "Full payment"
    },
    "fields": {
      "description": "Description",
      "program": "Program",
      "rules": "Rules",
      "visitTerms": "Attendance terms",
      "cancellationTerms": "Cancellation and refund terms",
      "extraConditions": "Additional conditions",
      "depositTerms": "Deposit terms"
    },
    "errors": {
      "publishMissing": "Complete required fields before publishing",
      "notFound": "Event not found.",
      "invalidTransition": "This event status change is not allowed.",
      "deleteNotAllowed": "A published event cannot be permanently deleted.",
      "posterRequired": "Choose a poster file.",
      "posterTooLarge": "The poster must be under 5 MB.",
      "posterTypeInvalid": "The poster must be a valid JPEG, PNG, or WebP file."
    }
  }
} satisfies Record<EventLocale, object>;
