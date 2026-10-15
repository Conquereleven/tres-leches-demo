export const packCopy = (lang: string) =>
  ({
    en: {
      choose: "Choose your flavors",
      selected: "pieces selected",
      incomplete: "Select exactly the pack capacity to continue.",
      unavailable:
        "Pack flavors are not currently available. Please review your selection.",
      edit: "Edit flavors",
      save: "Save composition",
      perBox: "Per box",
      eligibility: "Pack flavor eligibility",
      approval:
        "Enable only flavors confirmed for production. Save a private draft, then review and publish.",
      draft: "Save pack eligibility draft",
      disabled: "Not enabled for customer ordering",
      boxes: "boxes",
    },
    es: {
      choose: "Elige tus sabores",
      selected: "piezas seleccionadas",
      incomplete: "Selecciona exactamente las piezas del pack para continuar.",
      unavailable:
        "Los sabores del pack no están disponibles. Revisa tu selección.",
      edit: "Editar sabores",
      save: "Guardar composición",
      perBox: "Por caja",
      eligibility: "Disponibilidad de sabores para packs",
      approval:
        "Habilita solo sabores confirmados para producción. Guarda un borrador privado, revisa y publica.",
      draft: "Guardar borrador de disponibilidad",
      disabled: "No habilitado para pedidos",
      boxes: "cajas",
    },
    ar: {
      choose: "اختر النكهات",
      selected: "قطع مختارة",
      incomplete: "اختر العدد المحدد من القطع للمتابعة.",
      unavailable: "نكهات العبوة غير متاحة حالياً. يرجى مراجعة اختيارك.",
      edit: "تعديل النكهات",
      save: "حفظ التشكيلة",
      perBox: "لكل علبة",
      eligibility: "توفر نكهات العبوات",
      approval:
        "فعّل فقط النكهات المؤكدة للإنتاج. احفظ مسودة خاصة ثم راجعها وانشرها.",
      draft: "حفظ مسودة التوفر",
      disabled: "غير مفعّل للطلبات",
      boxes: "علب",
    },
  })[lang as "en" | "es" | "ar"] ?? {
    choose: "Choose your flavors",
    selected: "pieces selected",
    incomplete: "Select exactly the pack capacity to continue.",
    unavailable:
      "Pack flavors are not currently available. Please review your selection.",
    edit: "Edit flavors",
    save: "Save composition",
    perBox: "Per box",
    eligibility: "Pack flavor eligibility",
    approval:
      "Enable only flavors confirmed for production. Save a private draft, then review and publish.",
    draft: "Save pack eligibility draft",
    disabled: "Not enabled for customer ordering",
    boxes: "boxes",
  };
