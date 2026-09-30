'use strict';

const LANGUAGES = [
  { code:'en', name:'English' },
  { code:'fr', name:'Français' },
  { code:'ar', name:'العربية' },
];

const LANGUAGE_CATALOG = {
  fr: {
    'Overview':'Vue d’ensemble','Home':'Accueil',
    'Devices':'Appareils','Device':'Appareil','Telemetry':'Télémétrie','Alarms':'Alarmes',
    'Automation':'Automatisation','Automate':'Automatiser','Firmware':'Micrologiciel',
    'Firmware / OTA':'Micrologiciel / OTA','Settings':'Paramètres',
    'More':'Plus','More options':'Plus d’options','Sites':'Sites','Sort by':'Trier par',
    'Name':'Nom','Status':'État','Last seen':'Vu pour la dernière fois','Favorites first':'Favoris en premier',
    'Search devices, sites…':'Rechercher des appareils, des sites…','Open command palette':'Ouvrir la palette de commandes',
    'Command palette':'Palette de commandes','Broker status: connecting':'État du broker : connexion',
    'Broker status: connected':'État du broker : connecté','Broker status: disconnected':'État du broker : déconnecté',
    'connecting':'connexion','connected':'connecté','Unacknowledged alarms':'Alarmes non acquittées',
    'Unacknowledged':'Non acquittées','Open Alarms':'Ouvrir les alarmes','unack':'non acquittées',
    'Fleet Health':'État du parc','Needs attention':'À traiter','Priority':'Priorité',
    'Recent activity':'Activité récente','Quick controls':'Commandes rapides','Locations':'Emplacements',
    'online':'en ligne','warning':'avertissement','offline':'hors ligne','Online':'En ligne',
    'Warning':'Avertissement','Offline':'Hors ligne','Active alarms':'Alarmes actives',
    'All devices':'Tous les appareils','No matches.':'Aucun résultat.','Cancel':'Annuler',
    'Confirm':'Confirmer','Done':'Terminé','Clear':'Effacer','On':'Activé','Off':'Désactivé',
    'Acknowledge':'Acquitter','Open':'Ouvrir','Sign out':'Déconnexion','Toggle theme':'Changer de thème',
    'Toggle developer mode':'Activer/désactiver le mode développeur','Keyboard shortcuts':'Raccourcis clavier',
    'Users':'Utilisateurs','User':'Utilisateur','Viewer':'Lecteur','Operator':'Opérateur','Admin':'Administrateur',
    'Add':'Ajouter','Username':'Nom d’utilisateur','New site name':'Nom du nouveau site',
    'Broker':'Broker','URI':'URI','TLS':'TLS','disabled':'désactivé','Client ID':'ID client',
    'Backup':'Sauvegarde','Export':'Exporter','Import':'Importer','Audit log':'Journal d’audit',
    'No entries yet.':'Aucune entrée pour le moment.','Language':'Langue','Choose interface language':'Choisir la langue de l’interface',
    'Sign in as admin.':'Connectez-vous en tant qu’administrateur.','Dashboard':'Tableau de bord',
    'Fleet control — sign in to continue':'Contrôle du parc — connectez-vous pour continuer',
    'Sign in':'Se connecter','Invalid username or password.':'Nom d’utilisateur ou mot de passe invalide.',
    'Demo data':'Données de démonstration','No blocks active.':'Aucun blocage actif.',
    'Rules':'Règles','New rule':'Nouvelle règle','Exported':'Exporté','Backup exported':'Sauvegarde exportée',
    'Backup restored':'Sauvegarde restaurée','Import failed':'Échec de l’importation','Copy failed':'Échec de la copie',
    'Copied':'Copié','Dismiss':'Fermer','Close':'Fermer',
    '5m':'5 min','1h':'1 h','24h':'24 h','Live':'En direct','Chart':'Graphique','Charts':'Graphiques','Fleet command':'Commande du parc',
    'FLEET COMMAND':'COMMANDE DU PARC','FLEET HEALTH':'ÉTAT DU PARC','PRIORITY':'PRIORITÉ',
    'LOCATIONS':'EMPLACEMENTS','FLEET LOG':'JOURNAL DU PARC','AT A GLANCE':'EN UN COUP D’ŒIL',
    'devices':'appareils','device':'appareil','need attention':'à traiter','alarms':'alarmes',
    'Fleet health':'État du parc',
    'View alarm center':'Voir le centre des alarmes','Loading':'Chargement',
    'All sites':'Tous les sites','Favorites':'Favoris','All':'Tous','Refresh':'Actualiser','Fav':'Favoris',
    'Filter':'Filtrer','Search':'Rechercher','Apply':'Appliquer','Save':'Enregistrer',
    'Edit':'Modifier','Delete':'Supprimer','Remove':'Retirer','Restore':'Restaurer',
    'Enabled':'Activé','Disabled':'Désactivé','Active':'Actif','Inactive':'Inactif',
    'Temperature':'Température','Humidity':'Humidité','Battery':'Batterie','Voltage':'Tension',
    'Power':'Alimentation','Last updated':'Mis à jour','Current health and the issues that need your attention.':'État actuel et problèmes à traiter.',
    'No devices found.':'Aucun appareil trouvé.','No alarms.':'Aucune alarme.',
    'Unknown':'Inconnu','Critical':'Critique','High':'Élevé','Medium':'Moyen','Low':'Faible',
    'Acknowledge alarm':'Acquitter l’alarme','View details':'Voir les détails',
    'Account':'Compte','Collapse sidebar':'Réduire la barre latérale','Expand sidebar':'Développer la barre latérale',
    'Activity':'Activité','Config':'Configuration','Events':'Événements','Diagnostics':'Diagnostics',
    'Schedules':'Plannings','Scenes':'Scènes','Available':'Disponible','No data':'Aucune donnée',
    'stale':'obsolète','Gauge':'Jauge','Gauges':'Jauges','Trends':'Tendances','Range':'Période',
    'Time window':'Période','Select device':'Sélectionner un appareil','Last heartbeat':'Dernier signal',
    'Heartbeat period':'Période du signal','Firmware version':'Version du micrologiciel',
    'Select':'Sélectionner','Clear filter':'Effacer le filtre','No devices match.':'Aucun appareil ne correspond.',
    'Device not found.':'Appareil introuvable.','Back':'Retour','Remove favorite':'Retirer des favoris',
    'Add favorite':'Ajouter aux favoris','All priorities':'Toutes les priorités',
    'Active':'Actives','Shelved':'Mises en veille','History':'Historique','Clear device filter':'Effacer le filtre de l’appareil',
    'Nothing here yet.':'Rien ici pour le moment.','No active alarms.':'Aucune alarme active.',
    'latched':'verrouillée','left':'restant','since':'depuis','acked':'acquittée',
    'UNACK_ALARM':'NON ACQUITTÉE','ACK_ALARM':'ACQUITTÉE','RTN_ALARM':'RÉTABLIE',
    'RTN_UNACK':'RÉTABLIE, NON ACQUITTÉE',
    'Ack':'Acquitter','Shelve':'Mettre en veille','Unshelve':'Sortir de veille',
    'critical':'critique','high':'élevé','medium':'moyen','low':'faible',
    'Select site':'Sélectionner un site',
    'site':'site','Site':'Site','Sites & sort':'Sites et tri','last seen':'dernière activité','No site selected':'Aucun site sélectionné',
    'unknown':'inconnu','since unknown':'durée inconnue','type':'type','active':'active','shelved':'en veille','history':'historique',
    'feedback mismatch, possible stuck contact':'écart de retour, contact possiblement bloqué',
    'backup battery below 15%':'batterie de secours sous 15 %',
    'offline for over 2 hours':'hors ligne depuis plus de 2 h',
    'runtime exceeded 2h continuous':'durée de fonctionnement supérieure à 2 h en continu',
    'relay stuck':'relais bloqué','low battery':'batterie faible','device offline':'appareil hors ligne',
    'over temp':'température élevée','water leak':'fuite d’eau','threshold':'seuil',
    'Replace the battery soon':'Remplacer bientôt la batterie',
    'not live':'non disponible','Nothing to show yet':'Rien à afficher pour le moment',
    'FLEET OPERATIONS':'OPÉRATIONS DU PARC',
    'Review priority, acknowledge incidents, and track alarm history.':'Consultez les priorités, acquittez les incidents et suivez leur historique.',
    'Demo alarm feed.':'Flux d’alarmes de démonstration.',
    'Alarm topics are defined, but the device firmware does not publish live alarm states yet.':'Les sujets d’alarme sont définis, mais le micrologiciel ne publie pas encore d’états d’alarme en direct.',
    'Unacknowledged':'Non acquittées','Requires operator review':'À examiner par un opérateur',
    'Active alarms':'Alarmes actives','affected devices':'appareils concernés',
    'Highest priority first':'Priorité la plus élevée d’abord','Temporarily suppressed':'Temporairement suspendues',
    'Alarm categories':'Catégories d’alarme','Filter active incidents by type':'Filtrer les incidents actifs par type',
    'Alarm types':'Types d’alarme','Alarm summary':'Résumé des alarmes','Alarm view':'Vue des alarmes',
    'Clear type':'Effacer le type','Incident queue':'File des incidents',
    'Critical and oldest alarms are shown first.':'Les alarmes critiques et les plus anciennes apparaissent en premier.',
    'items':'éléments','unacknowledged':'non acquittées','Duration unknown':'Durée inconnue',
    'Active for':'Active depuis','Acked by':'Acquittée par','operator':'opérateur',
    'No shelved alarms.':'Aucune alarme suspendue.','Try clearing a filter or selecting another alarm view.':'Effacez un filtre ou choisissez une autre vue.',
    'DEMO':'DÉMO','FLEET':'PARC',
  },
  ar: {
    'Dashboard':'لوحة المعلومات','Overview':'نظرة عامة','Home':'الرئيسية',
    'Devices':'الأجهزة','Device':'الجهاز','Telemetry':'القياسات عن بُعد','Alarms':'الإنذارات',
    'Automation':'الأتمتة','Automate':'أتمتة','Firmware':'البرنامج الثابت',
    'Firmware / OTA':'البرنامج الثابت / OTA','Settings':'الإعدادات',
    'More':'المزيد','More options':'خيارات إضافية','Sites':'المواقع','Sort by':'ترتيب حسب',
    'Name':'الاسم','Status':'الحالة','Last seen':'آخر ظهور','Favorites first':'المفضلة أولاً',
    'Search devices, sites…':'ابحث عن الأجهزة والمواقع…','Open command palette':'فتح لوحة الأوامر',
    'Command palette':'لوحة الأوامر','Broker status: connecting':'حالة الوسيط: جارٍ الاتصال',
    'Broker status: connected':'حالة الوسيط: متصل','Broker status: disconnected':'حالة الوسيط: غير متصل',
    'connecting':'جارٍ الاتصال','connected':'متصل','Unacknowledged alarms':'إنذارات غير مؤكدة',
    'Unacknowledged':'غير مؤكدة','Open Alarms':'فتح الإنذارات','unack':'غير مؤكدة',
    'Fleet Health':'حالة الأسطول','Needs attention':'يتطلب الانتباه','Priority':'الأولوية',
    'Recent activity':'النشاط الأخير','Quick controls':'عناصر التحكم السريعة','Locations':'المواقع',
    'online':'متصل','warning':'تحذير','offline':'غير متصل','Online':'متصل',
    'Warning':'تحذير','Offline':'غير متصل','Active alarms':'الإنذارات النشطة',
    'All devices':'كل الأجهزة','No matches.':'لا توجد نتائج.','Cancel':'إلغاء',
    'Confirm':'تأكيد','Done':'تم','Clear':'مسح','On':'تشغيل','Off':'إيقاف',
    'Acknowledge':'تأكيد الاستلام','Open':'فتح','Sign out':'تسجيل الخروج','Toggle theme':'تبديل المظهر',
    'Toggle developer mode':'تبديل وضع المطور','Keyboard shortcuts':'اختصارات لوحة المفاتيح',
    'Users':'المستخدمون','User':'المستخدم','Viewer':'مشاهد','Operator':'مشغّل','Admin':'مسؤول',
    'Add':'إضافة','Username':'اسم المستخدم','New site name':'اسم الموقع الجديد',
    'Broker':'الوسيط','URI':'عنوان URI','TLS':'TLS','disabled':'معطّل','Client ID':'معرّف العميل',
    'Backup':'نسخ احتياطي','Export':'تصدير','Import':'استيراد','Audit log':'سجل التدقيق',
    'No entries yet.':'لا توجد إدخالات بعد.','Language':'اللغة','Choose interface language':'اختر لغة الواجهة',
    'Sign in as admin.':'سجّل الدخول بصفتك مسؤولاً.',
    'Fleet control — sign in to continue':'التحكم بالأسطول — سجّل الدخول للمتابعة',
    'Sign in':'تسجيل الدخول','Invalid username or password.':'اسم المستخدم أو كلمة المرور غير صحيحة.',
    'Demo data':'بيانات تجريبية','No blocks active.':'لا توجد قيود نشطة.',
    'Rules':'القواعد','New rule':'قاعدة جديدة','Backup exported':'تم تصدير النسخة الاحتياطية',
    'Backup restored':'تمت استعادة النسخة الاحتياطية','Import failed':'فشل الاستيراد','Copy failed':'فشل النسخ',
    'Copied':'تم النسخ','Dismiss':'إغلاق','Close':'إغلاق','5m':'٥ دقائق','1h':'ساعة','24h':'٢٤ ساعة',
    'Live':'مباشر','Chart':'مخطط','Charts':'مخططات','Fleet command':'التحكم بالأسطول',
    'FLEET COMMAND':'التحكم بالأسطول','FLEET HEALTH':'حالة الأسطول','PRIORITY':'الأولوية',
    'LOCATIONS':'المواقع','FLEET LOG':'سجل الأسطول','AT A GLANCE':'لمحة سريعة',
    'devices':'أجهزة','device':'جهاز','need attention':'تتطلب الانتباه','alarms':'إنذارات',
    'Fleet health':'حالة الأسطول',
    'View alarm center':'عرض مركز الإنذارات','Loading':'جارٍ التحميل',
    'All sites':'كل المواقع','Favorites':'المفضلة','All':'الكل','Refresh':'تحديث','Fav':'المفضلة',
    'Filter':'تصفية','Search':'بحث','Apply':'تطبيق','Save':'حفظ',
    'Edit':'تعديل','Delete':'حذف','Remove':'إزالة','Restore':'استعادة',
    'Enabled':'مفعّل','Disabled':'معطّل','Active':'نشط','Inactive':'غير نشط',
    'Temperature':'درجة الحرارة','Humidity':'الرطوبة','Battery':'البطارية','Voltage':'الجهد',
    'Power':'الطاقة','Last updated':'آخر تحديث','Current health and the issues that need your attention.':'الحالة الحالية والمشكلات التي تتطلب الانتباه.',
    'No devices found.':'لم يتم العثور على أجهزة.','No alarms.':'لا توجد إنذارات.',
    'Unknown':'غير معروف','Critical':'حرج','High':'مرتفع','Medium':'متوسط','Low':'منخفض',
    'Acknowledge alarm':'تأكيد استلام الإنذار','View details':'عرض التفاصيل',
    'Account':'الحساب','Collapse sidebar':'طي الشريط الجانبي','Expand sidebar':'توسيع الشريط الجانبي',
    'Activity':'النشاط','Config':'الإعدادات','Events':'الأحداث','Diagnostics':'التشخيص',
    'Schedules':'الجداول','Scenes':'المشاهد','Available':'متاح','No data':'لا توجد بيانات',
    'stale':'قديمة','Gauge':'مؤشر','Gauges':'مؤشرات','Trends':'الاتجاهات','Range':'النطاق',
    'Time window':'الفترة الزمنية','Select device':'اختر جهازاً','Last heartbeat':'آخر نبضة',
    'Heartbeat period':'فترة النبض','Firmware version':'إصدار البرنامج الثابت',
    'Select':'تحديد','Clear filter':'مسح عامل التصفية','No devices match.':'لا توجد أجهزة مطابقة.',
    'Device not found.':'لم يتم العثور على الجهاز.','Back':'رجوع','Remove favorite':'إزالة من المفضلة',
    'Add favorite':'إضافة إلى المفضلة','All priorities':'كل الأولويات',
    'Active':'نشطة','Shelved':'مؤجلة','History':'السجل','Clear device filter':'مسح تصفية الجهاز',
    'Nothing here yet.':'لا يوجد شيء هنا بعد.','No active alarms.':'لا توجد إنذارات نشطة.',
    'latched':'مثبّت','left':'متبقية','since':'منذ','acked':'تم التأكيد',
    'UNACK_ALARM':'غير مؤكدة','ACK_ALARM':'مؤكدة','RTN_ALARM':'عادت للحالة الطبيعية',
    'RTN_UNACK':'عادت للحالة الطبيعية، غير مؤكدة',
    'Ack':'تأكيد','Shelve':'تأجيل','Unshelve':'إلغاء التأجيل',
    'critical':'حرج','high':'مرتفع','medium':'متوسط','low':'منخفض',
    'Select site':'اختر موقعاً','all':'الكل','site':'الموقع','Site':'الموقع','Sites & sort':'المواقع والترتيب','last seen':'آخر ظهور',
    'unknown':'غير معروف','since unknown':'المدة غير معروفة','type':'النوع','active':'نشطة','shelved':'مؤجلة','history':'السجل',
    'feedback mismatch, possible stuck contact':'اختلاف في إشارة التأكيد، قد يكون المفتاح عالقاً',
    'backup battery below 15%':'بطارية الاحتياط أقل من ١٥٪',
    'offline for over 2 hours':'غير متصل لأكثر من ساعتين',
    'runtime exceeded 2h continuous':'تجاوز التشغيل ساعتين متواصلتين',
    'relay stuck':'مرحل عالق','low battery':'بطارية منخفضة','device offline':'الجهاز غير متصل',
    'over temp':'حرارة مرتفعة','water leak':'تسرّب مياه','threshold':'عتبة',
    'Replace the battery soon':'استبدل البطارية قريباً',
    'not live':'غير متاح','Nothing to show yet':'لا يوجد شيء لعرضه بعد',
    'FLEET OPERATIONS':'عمليات الأسطول',
    'Review priority, acknowledge incidents, and track alarm history.':'راجع الأولويات وأكّد استلام الحوادث وتابع سجل الإنذارات.',
    'Demo alarm feed.':'تغذية إنذارات تجريبية.',
    'Alarm topics are defined, but the device firmware does not publish live alarm states yet.':'مواضيع الإنذارات معرّفة، لكن البرنامج الثابت للأجهزة لا ينشر حالات إنذار مباشرة حتى الآن.',
    'Unacknowledged':'غير مؤكدة','Requires operator review':'تتطلب مراجعة المشغّل',
    'Active alarms':'الإنذارات النشطة','affected devices':'أجهزة متأثرة',
    'Highest priority first':'الأولوية الأعلى أولاً','Temporarily suppressed':'معلّقة مؤقتاً',
    'Alarm categories':'فئات الإنذارات','Filter active incidents by type':'تصفية الحوادث النشطة حسب النوع',
    'Alarm types':'أنواع الإنذارات','Alarm summary':'ملخص الإنذارات','Alarm view':'عرض الإنذارات',
    'Clear type':'مسح النوع','Incident queue':'قائمة الحوادث',
    'Critical and oldest alarms are shown first.':'تظهر الإنذارات الحرجة والأقدم أولاً.',
    'items':'عناصر','unacknowledged':'غير مؤكدة','Duration unknown':'المدة غير معروفة',
    'Active for':'نشطة منذ','Acked by':'تم التأكيد بواسطة','operator':'المشغّل',
    'No shelved alarms.':'لا توجد إنذارات مؤجلة.','Try clearing a filter or selecting another alarm view.':'امسح أحد عوامل التصفية أو اختر عرضاً آخر للإنذارات.',
    'DEMO':'تجريبي','FLEET':'الأسطول',
  },
};
const ORIGINAL_TEXT = new WeakMap();
const ORIGINAL_ATTRIBUTES = new WeakMap();
const COMPOSABLE_KEYS = [
  'View alarm center','acked','latched','since unknown','type','feedback mismatch, possible stuck contact',
  'backup battery below 15%','offline for over 2 hours','runtime exceeded 2h continuous',
];

function getLanguage() {
  return LANGUAGES.some(language => language.code === state.language) ? state.language : 'en';
}
function translateText(value) {
  const language = getLanguage();
  if (language === 'en') return value;
  const catalog = LANGUAGE_CATALOG[language];
  if (catalog[value]) return catalog[value];
  const number = new Intl.NumberFormat(language === 'ar' ? 'ar' : 'fr');
  const ago = value.match(/^(seen |offline )?(\d+)(s|m|h|d) ago$/);
  if (ago) {
    const units = language === 'fr'
      ? { s:'s', m:'min', h:'h', d:'j' }
      : { s:'ث', m:'د', h:'س', d:'ي' };
    const amount = number.format(Number(ago[2]));
    const isOffline = ago[1] === 'offline ';
    return language === 'fr'
      ? `${isOffline ? 'hors ligne · ' : ago[1] ? 'vu ' : ''}il y a ${amount} ${units[ago[3]]}`
      : `${isOffline ? 'غير متصل منذ ' : ago[1] ? 'شوهد منذ ' : 'منذ '}${amount} ${units[ago[3]]}`;
  }
  const count = value.match(/^(\d+)\s+(devices?|alarms?)$/);
  if (count) {
    const amount = number.format(Number(count[1]));
    if (language === 'fr') return `${amount} ${count[2].startsWith('device') ? (count[1] === '1' ? 'appareil' : 'appareils') : 'alarmes'}`;
    return `${amount} ${count[2].startsWith('device') ? 'أجهزة' : 'إنذارات'}`;
  }
  const activeCount = value.match(/^(\d+) active(?: · (\d+) shelved)?$/);
  if (activeCount) {
    const active = number.format(Number(activeCount[1]));
    const shelved = activeCount[2] == null ? '' : ` · ${number.format(Number(activeCount[2]))} ${language === 'fr' ? 'en veille' : 'مؤجلة'}`;
    return language === 'fr' ? `${active} active${activeCount[1] === '1' ? '' : 's'}${shelved}` : `${active} نشطة${shelved}`;
  }
  const selectedCount = value.match(/^(\d+) selected$/);
  if (selectedCount) return language === 'fr'
    ? `${number.format(Number(selectedCount[1]))} sélectionné${selectedCount[1] === '1' ? '' : 's'}`
    : `${number.format(Number(selectedCount[1]))} محدد`;
  const activeFor = value.match(/^Active for (.+)$/);
  if (activeFor) return `${catalog['Active for']} ${translateText(activeFor[1])}`;
  const affected = value.match(/^(\d+) affected devices$/);
  if (affected) return `${number.format(Number(affected[1]))} ${catalog['affected devices']}`;
  const itemCount = value.match(/^(\d+) items$/);
  if (itemCount) return `${number.format(Number(itemCount[1]))} ${catalog.items}`;
  const unackCount = value.match(/^(\d+) unacknowledged$/);
  if (unackCount) return `${number.format(Number(unackCount[1]))} ${catalog.unacknowledged}`;
  const ackedBy = value.match(/^Acked by (.+)$/);
  if (ackedBy) return `${catalog['Acked by']} ${ackedBy[1]}`;
  const since = value.match(/^since (\d+)(s|m|h|d) ago$/);
  if (since) {
    const amount = number.format(Number(since[1]));
    const units = language === 'fr' ? { s:'s', m:'min', h:'h', d:'j' } : { s:'ث', m:'د', h:'س', d:'ي' };
    return language === 'fr' ? `depuis ${amount} ${units[since[2]]}` : `منذ ${amount} ${units[since[2]]}`;
  }
  const left = value.match(/^(\d+[smhd] ago) left$/);
  if (left) {
    const agoText = translateText(left[1]).replace(/^(?:vu |شوهد منذ )/, '');
    return language === 'fr' ? `reste ${agoText}` : `متبقي ${agoText}`;
  }
  const timeFragment = /(^|[^\p{L}\p{N}])((?:seen |offline )?\d+(?:s|m|h|d) ago|since \d+(?:s|m|h|d) ago|\d+(?:s|m|h|d) ago left)(?=$|[^\p{L}\p{N}])/gu;
  if (timeFragment.test(value)) {
    timeFragment.lastIndex = 0;
    value = value.replace(timeFragment, (match, prefix, fragment) => prefix + translateText(fragment));
  }
  const keys = COMPOSABLE_KEYS.filter(key => catalog[key]).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${keys.map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'gu');
  return value.replace(pattern, (match, prefix, key) => prefix + catalog[key]);
}
function localizedSource(node, current, language, cache) {
  const previous = cache.get(node);
  if (!previous || current !== previous.rendered) return current;
  return previous.source;
}
function translateNode(root) {
  const textNodes = root.nodeType === Node.TEXT_NODE ? [root] : [];
  if (root.nodeType !== Node.TEXT_NODE) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) textNodes.push(walker.currentNode);
  }
  textNodes.forEach(node => {
    const trimmed = node.nodeValue.trim();
    if (!trimmed) return;
    const language = getLanguage();
    const source = localizedSource(node, trimmed, language, ORIGINAL_TEXT);
    const translated = translateText(source);
    ORIGINAL_TEXT.set(node, { source, rendered:translated });
    if (translated !== trimmed) node.nodeValue = node.nodeValue.replace(trimmed, translated);
  });
  if (root.nodeType === Node.ELEMENT_NODE) {
    ['title','placeholder','aria-label'].forEach(attribute => {
      translateAttribute(root, attribute);
    });
    root.querySelectorAll('[title],[placeholder],[aria-label]').forEach(element => {
      ['title','placeholder','aria-label'].forEach(attribute => translateAttribute(element, attribute));
    });
  }
}
function translateAttribute(element, attribute) {
  const current = element.getAttribute(attribute);
  if (!current) return;
  let attributes = ORIGINAL_ATTRIBUTES.get(element);
  if (!attributes) { attributes = new Map(); ORIGINAL_ATTRIBUTES.set(element, attributes); }
  const source = localizedSource(element, current, getLanguage(), {
    get: node => attributes.get(attribute),
    set: (node, value) => attributes.set(attribute, value),
  });
  const translated = translateText(source);
  attributes.set(attribute, { source, rendered:translated });
  if (translated !== current) element.setAttribute(attribute, translated);
}
function setLanguage(language) {
  if (!LANGUAGES.some(item => item.code === language)) throw new Error(`Unsupported language: ${language}`);
  state.language = language;
  lsSet('electrix_language', language);
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  translateNode(document.body);
}
function initLanguage() {
  setLanguage(getLanguage());
  const observer = new MutationObserver(records => {
    const roots = new Set();
    records.forEach(record => {
      if (record.type === 'characterData') roots.add(record.target.parentElement || document.body);
      record.addedNodes?.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) roots.add(node);
        else if (node.nodeType === Node.TEXT_NODE) roots.add(node);
      });
    });
    [...roots].filter(root => {
      for (let parent = root.parentElement; parent; parent = parent.parentElement) {
        if (roots.has(parent)) return false;
      }
      return true;
    }).forEach(translateNode);
  });
  observer.observe(document.body, { childList:true, characterData:true, subtree:true });
}
