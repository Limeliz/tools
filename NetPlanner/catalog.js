/*
 * Enhetskatalog för Nätverksplaneraren.
 *
 * Specifikationerna är hämtade ur minnet/datablad och ska ses som ungefärliga.
 * Kontrollera alltid mot tillverkarens datablad innan inköp. Lägg gärna till
 * egna modeller här – formatet förklaras nedan.
 *
 * ports: lista med portgrupper i den ordning de numreras
 *   n     antal portar
 *   t     'rj45' (standard) eller 'sfp'
 *   sp    hastighet, t.ex. '1G', '2.5G', '10G' (standard '1G')
 *   poe   PoE ut på porten: 'af' (PoE, 15 W), 'at' (PoE+, 30 W), 'bt' (PoE++, 60 W)
 *   role  'wan' = WAN-port, 'poein' = porten som enheten själv kan matas via (PoE in)
 * budget  total PoE-budget i watt (ut)
 * poeIn   PoE-klass som krävs för att mata enheten via PoE ('af'|'at'|'bt')
 * selfW   enhetens egen förbrukning i watt (används när den matas via PoE)
 * poe     PoE-klass som en klientenhet (AP, kamera …) kräver
 * watts   klientenhetens maxförbrukning i watt
 * wifi    enheten har WiFi-AP (klienter kan anslutas trådlöst)
 * cellular enheten har egen internetanslutning (4G/5G)
 */

const POE_LEVEL = { af: 1, at: 2, bt: 3 };
/* Max effekt som kan tas ut hos enheten (PD) per klass */
const POE_MAX_W = { af: 12.95, at: 25.5, bt: 51 };
const POE_SHORT = { af: 'PoE', at: 'PoE+', bt: 'PoE++' };
const POE_LONG = { af: 'PoE (802.3af)', at: 'PoE+ (802.3at)', bt: 'PoE++ (802.3bt)' };

const TYPES = {
  isp:         { label: 'Internet / WAN',   icon: '🛰️', color: '#7c3aed', infra: true },
  router:      { label: 'Router / Gateway', icon: '🌐', color: '#2563eb', infra: true },
  switch:      { label: 'Switch',           icon: '🔀', color: '#0891b2', infra: true },
  ap:          { label: 'Accesspunkt',      icon: '📶', color: '#0d9488', wifi: true, poe: 'af', watts: 10 },
  camera:      { label: 'Kamera',           icon: '📷', color: '#ea580c', poe: 'af', watts: 6 },
  nvr:         { label: 'NVR / Server',     icon: '💾', color: '#9333ea' },
  workstation: { label: 'Arbetsstation',    icon: '🖥️', color: '#475569', canWifi: true },
  laptop:      { label: 'Laptop',           icon: '💻', color: '#475569', canWifi: true, conn: 'wifi' },
  mobile:      { label: 'Mobil / Platta',   icon: '📱', color: '#475569', canWifi: true, conn: 'wifi' },
  printer:     { label: 'Skrivare',         icon: '🖨️', color: '#475569', canWifi: true },
  tv:          { label: 'TV / Skärm',       icon: '📺', color: '#475569', canWifi: true },
  phone:       { label: 'IP-telefon',       icon: '☎️', color: '#475569', poe: 'af', watts: 5 },
  iot:         { label: 'Övrigt / IoT',     icon: '🔌', color: '#475569', canWifi: true },
};

const UI = 'Ubiquiti UniFi';
const TT = 'Teltonika';
const SL = 'Starlink';
const GEN = 'Generisk';

const CATALOG = [
  /* ---------- Internet / WAN ---------- */
  { id: 'starlink-gen3', type: 'isp', vendor: SL, name: 'Starlink Standard (Gen3)', ports: [{ n: 2 }], wifi: true,
    note: 'Gen3-routern har 2 LAN-portar. Disken matas av routern.' },
  { id: 'starlink-actuated', type: 'isp', vendor: SL, name: 'Starlink Standard Actuated (Gen2)', ports: [{ n: 1 }], wifi: true,
    note: 'Kräver Starlink Ethernet Adapter för trådbunden anslutning.' },
  { id: 'starlink-mini', type: 'isp', vendor: SL, name: 'Starlink Mini', ports: [{ n: 1 }], wifi: true,
    note: 'Inbyggd router. Saknar RJ45 – trådbunden anslutning kräver adapter.' },
  { id: 'isp-generic', type: 'isp', vendor: GEN, name: 'Fiber / modem', ports: [{ n: 1 }] },

  /* ---------- Routrar / gateways ---------- */
  { id: 'ucg-ultra', type: 'router', vendor: UI, name: 'UniFi Cloud Gateway Ultra (UCG-Ultra)',
    ports: [{ n: 1, role: 'wan', sp: '2.5G' }, { n: 4 }] },
  { id: 'ucg-max', type: 'router', vendor: UI, name: 'UniFi Cloud Gateway Max (UCG-Max)',
    ports: [{ n: 1, role: 'wan', sp: '2.5G' }, { n: 4, sp: '2.5G' }] },
  { id: 'ucg-fiber', type: 'router', vendor: UI, name: 'UniFi Cloud Gateway Fiber (UCG-Fiber)',
    ports: [{ n: 1, role: 'wan', sp: '10G' }, { n: 4, sp: '2.5G' }, { n: 1, t: 'sfp', sp: '10G', role: 'wan' }, { n: 1, t: 'sfp', sp: '10G' }],
    note: 'Kontrollera PoE-ut och portroller mot datablad.' },
  { id: 'udr', type: 'router', vendor: UI, name: 'UniFi Dream Router (UDR)', wifi: true,
    ports: [{ n: 1, role: 'wan' }, { n: 2 }, { n: 2, poe: 'af' }], budget: 15,
    note: '2 portar med PoE ut. Budget ungefärlig.' },
  { id: 'udm-pro', type: 'router', vendor: UI, name: 'UniFi Dream Machine Pro (UDM-Pro)',
    ports: [{ n: 1, role: 'wan' }, { n: 1, t: 'sfp', sp: '10G', role: 'wan' }, { n: 8 }, { n: 1, t: 'sfp', sp: '10G' }] },
  { id: 'udm-se', type: 'router', vendor: UI, name: 'UniFi Dream Machine SE (UDM-SE)',
    ports: [{ n: 1, role: 'wan', sp: '2.5G' }, { n: 1, t: 'sfp', sp: '10G', role: 'wan' }, { n: 2, poe: 'at' }, { n: 6, poe: 'af' }, { n: 1, t: 'sfp', sp: '10G' }],
    budget: 180 },
  { id: 'udm-pro-max', type: 'router', vendor: UI, name: 'UniFi Dream Machine Pro Max',
    ports: [{ n: 1, role: 'wan', sp: '2.5G' }, { n: 1, t: 'sfp', sp: '10G', role: 'wan' }, { n: 8 }, { n: 1, t: 'sfp', sp: '10G' }] },
  { id: 'uxg-lite', type: 'router', vendor: UI, name: 'UniFi Gateway Lite (UXG-Lite)', ports: [{ n: 1, role: 'wan' }, { n: 1 }] },

  { id: 'rutx50', type: 'router', vendor: TT, name: 'Teltonika RUTX50 (5G)', cellular: true, wifi: true,
    ports: [{ n: 1, role: 'wan' }, { n: 4 }], note: '5G-router, WiFi 5, 9–50 VDC.' },
  { id: 'rutm50', type: 'router', vendor: TT, name: 'Teltonika RUTM50 (5G)', cellular: true, wifi: true,
    ports: [{ n: 1, role: 'wan' }, { n: 3 }], note: 'Kontrollera portantal mot datablad.' },
  { id: 'rutx11', type: 'router', vendor: TT, name: 'Teltonika RUTX11 (4G)', cellular: true, wifi: true,
    ports: [{ n: 1, role: 'wan' }, { n: 4 }] },
  { id: 'trb500', type: 'router', vendor: TT, name: 'Teltonika TRB500 (5G-gateway)', cellular: true,
    ports: [{ n: 1 }], note: '5G-gateway med en Ethernetport.' },
  { id: 'otd500', type: 'router', vendor: TT, name: 'Teltonika OTD500 (5G utomhus)', cellular: true,
    ports: [{ n: 1, role: 'poein' }, { n: 1 }], poeIn: 'at', selfW: 15, note: 'Matas via PoE. Kontrollera mot datablad.' },
  { id: 'router-generic', type: 'router', vendor: GEN, name: 'Generisk router (1 WAN + 4 LAN)', ports: [{ n: 1, role: 'wan' }, { n: 4 }] },

  /* ---------- Switchar ---------- */
  { id: 'usw-flex-mini', type: 'switch', vendor: UI, name: 'USW-Flex-Mini', ports: [{ n: 1, role: 'poein' }, { n: 4 }],
    poeIn: 'af', selfW: 2.5, note: 'Kan matas via PoE på port 1 eller USB-C.' },
  { id: 'usw-flex', type: 'switch', vendor: UI, name: 'USW-Flex', ports: [{ n: 1, role: 'poein' }, { n: 4, poe: 'af' }],
    budget: 46, poeIn: 'at', selfW: 5, note: 'Budget 46 W vid PoE++-matning, lägre med PoE+.' },
  { id: 'usw-ultra', type: 'switch', vendor: UI, name: 'USW-Ultra', ports: [{ n: 1, role: 'poein' }, { n: 7, poe: 'at' }],
    budget: 42, poeIn: 'bt', selfW: 5, note: 'Budget 42 W via PoE++ in, mer med extern adapter.' },
  { id: 'usw-lite-8-poe', type: 'switch', vendor: UI, name: 'USW-Lite-8-PoE', ports: [{ n: 4, poe: 'at' }, { n: 4 }], budget: 52 },
  { id: 'usw-lite-16-poe', type: 'switch', vendor: UI, name: 'USW-Lite-16-PoE', ports: [{ n: 8, poe: 'at' }, { n: 8 }], budget: 45 },
  { id: 'usw-16-poe', type: 'switch', vendor: UI, name: 'USW-16-PoE', ports: [{ n: 8, poe: 'at' }, { n: 8 }, { n: 2, t: 'sfp' }], budget: 42 },
  { id: 'usw-24', type: 'switch', vendor: UI, name: 'USW-24', ports: [{ n: 24 }, { n: 2, t: 'sfp' }] },
  { id: 'usw-24-poe', type: 'switch', vendor: UI, name: 'USW-24-PoE', ports: [{ n: 16, poe: 'at' }, { n: 8 }, { n: 2, t: 'sfp' }], budget: 95 },
  { id: 'usw-48-poe', type: 'switch', vendor: UI, name: 'USW-48-PoE', ports: [{ n: 32, poe: 'at' }, { n: 16 }, { n: 4, t: 'sfp' }], budget: 195 },
  { id: 'usw-pro-max-16', type: 'switch', vendor: UI, name: 'USW-Pro-Max-16', ports: [{ n: 12 }, { n: 4, sp: '2.5G' }, { n: 2, t: 'sfp', sp: '10G' }] },
  { id: 'usw-pro-max-16-poe', type: 'switch', vendor: UI, name: 'USW-Pro-Max-16-PoE',
    ports: [{ n: 12, poe: 'at' }, { n: 4, sp: '2.5G', poe: 'bt' }, { n: 2, t: 'sfp', sp: '10G' }], budget: 180 },
  { id: 'usw-pro-max-24-poe', type: 'switch', vendor: UI, name: 'USW-Pro-Max-24-PoE',
    ports: [{ n: 16, poe: 'at' }, { n: 8, sp: '2.5G', poe: 'bt' }, { n: 2, t: 'sfp', sp: '10G' }], budget: 400 },
  { id: 'usw-pro-max-48-poe', type: 'switch', vendor: UI, name: 'USW-Pro-Max-48-PoE',
    ports: [{ n: 32, poe: 'at' }, { n: 16, sp: '2.5G', poe: 'bt' }, { n: 4, t: 'sfp', sp: '10G' }], budget: 720 },
  { id: 'usw-pro-24-poe', type: 'switch', vendor: UI, name: 'USW-Pro-24-PoE',
    ports: [{ n: 16, poe: 'at' }, { n: 8, poe: 'bt' }, { n: 2, t: 'sfp', sp: '10G' }], budget: 400 },
  { id: 'usw-pro-48-poe', type: 'switch', vendor: UI, name: 'USW-Pro-48-PoE',
    ports: [{ n: 40, poe: 'at' }, { n: 8, poe: 'bt' }, { n: 4, t: 'sfp', sp: '10G' }], budget: 600 },
  { id: 'usw-ent-8-poe', type: 'switch', vendor: UI, name: 'USW-Enterprise-8-PoE',
    ports: [{ n: 8, sp: '2.5G', poe: 'bt' }, { n: 2, t: 'sfp', sp: '10G' }], budget: 120 },
  { id: 'usw-aggregation', type: 'switch', vendor: UI, name: 'USW-Aggregation', ports: [{ n: 8, t: 'sfp', sp: '10G' }] },
  { id: 'sw-gen-5', type: 'switch', vendor: GEN, name: 'Generisk 5-portars switch', ports: [{ n: 5 }] },
  { id: 'sw-gen-8', type: 'switch', vendor: GEN, name: 'Generisk 8-portars switch', ports: [{ n: 8 }] },
  { id: 'sw-gen-16', type: 'switch', vendor: GEN, name: 'Generisk 16-portars switch', ports: [{ n: 16 }] },

  /* ---------- Accesspunkter ---------- */
  { id: 'u6-plus', type: 'ap', vendor: UI, name: 'U6+', poe: 'af', watts: 9, wifi: true, ports: [{ n: 1, role: 'poein' }] },
  { id: 'u6-lite', type: 'ap', vendor: UI, name: 'U6-Lite', poe: 'af', watts: 12, wifi: true, ports: [{ n: 1, role: 'poein' }] },
  { id: 'u6-lr', type: 'ap', vendor: UI, name: 'U6-LR', poe: 'at', watts: 16.5, wifi: true, ports: [{ n: 1, role: 'poein' }] },
  { id: 'u6-pro', type: 'ap', vendor: UI, name: 'U6-Pro', poe: 'at', watts: 13, wifi: true, ports: [{ n: 1, role: 'poein' }] },
  { id: 'u6-mesh', type: 'ap', vendor: UI, name: 'U6-Mesh', poe: 'af', watts: 12, wifi: true, ports: [{ n: 1, role: 'poein' }] },
  { id: 'u6-ent', type: 'ap', vendor: UI, name: 'U6-Enterprise', poe: 'at', watts: 22, wifi: true, ports: [{ n: 1, role: 'poein', sp: '2.5G' }] },
  { id: 'u7-pro', type: 'ap', vendor: UI, name: 'U7-Pro', poe: 'at', watts: 21, wifi: true, ports: [{ n: 1, role: 'poein', sp: '2.5G' }] },
  { id: 'u7-pro-max', type: 'ap', vendor: UI, name: 'U7-Pro-Max', poe: 'at', watts: 25, wifi: true, ports: [{ n: 1, role: 'poein', sp: '2.5G' }] },
  { id: 'u7-outdoor', type: 'ap', vendor: UI, name: 'U7-Outdoor', poe: 'at', watts: 15, wifi: true, ports: [{ n: 1, role: 'poein' }] },

  /* ---------- Kameror ---------- */
  { id: 'g5-bullet', type: 'camera', vendor: UI, name: 'G5 Bullet', poe: 'af', watts: 4 },
  { id: 'g5-turret-ultra', type: 'camera', vendor: UI, name: 'G5 Turret Ultra', poe: 'af', watts: 4 },
  { id: 'g5-dome', type: 'camera', vendor: UI, name: 'G5 Dome', poe: 'af', watts: 5 },
  { id: 'g5-flex', type: 'camera', vendor: UI, name: 'G5 Flex', poe: 'af', watts: 4 },
  { id: 'g5-pro', type: 'camera', vendor: UI, name: 'G5 Pro', poe: 'af', watts: 8 },
  { id: 'ai-pro', type: 'camera', vendor: UI, name: 'AI Pro', poe: 'at', watts: 13 },
  { id: 'cam-poeplus', type: 'camera', vendor: GEN, name: 'Kamera med IR/värme (PoE+)', poe: 'at', watts: 15 },
  { id: 'cam-ptz', type: 'camera', vendor: GEN, name: 'PTZ-kamera (PoE+)', poe: 'at', watts: 25 },
  { id: 'cam-ptz-bt', type: 'camera', vendor: GEN, name: 'PTZ-kamera utomhus (PoE++)', poe: 'bt', watts: 45 },

  /* ---------- NVR / server ---------- */
  { id: 'unvr', type: 'nvr', vendor: UI, name: 'UNVR', ports: [{ n: 1 }, { n: 1, t: 'sfp', sp: '10G' }] },
  { id: 'unvr-pro', type: 'nvr', vendor: UI, name: 'UNVR-Pro', ports: [{ n: 1 }, { n: 1, t: 'sfp', sp: '10G' }] },
  { id: 'server-2nic', type: 'nvr', vendor: GEN, name: 'Server med 2 nätverkskort', ports: [{ n: 2 }] },
];

const CATALOG_BY_ID = Object.fromEntries(CATALOG.map(m => [m.id, m]));

/* Standardmodell när en typ läggs till ('' = generisk enhet utan katalogpost) */
const DEFAULT_MODEL = {
  isp: 'starlink-gen3', router: 'ucg-ultra', switch: 'usw-lite-8-poe', ap: 'u6-plus',
};

/* Paletten till vänster */
const PALETTE = [
  { group: 'Internet', items: [
    { type: 'isp', model: 'starlink-gen3', label: 'Starlink' },
    { type: 'router', model: 'rutx50', label: '5G-router (Teltonika)' },
    { type: 'isp', model: 'isp-generic', label: 'Fiber / modem' },
  ] },
  { group: 'Nätverk', items: [
    { type: 'router', model: 'ucg-ultra', label: 'Gateway (UniFi)' },
    { type: 'switch', model: 'usw-lite-8-poe', label: 'Switch' },
    { type: 'ap', model: 'u6-plus', label: 'Accesspunkt' },
  ] },
  { group: 'Övervakning', items: [
    { type: 'camera', model: '', label: 'Kamera' },
    { type: 'camera', model: 'cam-ptz', label: 'PTZ-kamera' },
    { type: 'nvr', model: '', label: 'NVR / Server' },
  ] },
  { group: 'Klienter', items: [
    { type: 'workstation', model: '', label: 'Arbetsstation' },
    { type: 'laptop', model: '', label: 'Laptop' },
    { type: 'mobile', model: '', label: 'Mobil / Platta' },
    { type: 'printer', model: '', label: 'Skrivare' },
    { type: 'tv', model: '', label: 'TV / Skärm' },
    { type: 'phone', model: '', label: 'IP-telefon' },
    { type: 'iot', model: '', label: 'Övrigt / IoT' },
  ] },
];
