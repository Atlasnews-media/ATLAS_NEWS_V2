export interface EditorialVisual {
  src: string;
  alt: string;
  source: string;
  sourceUrl: string;
  author: string;
  license: string;
}

export type FrontPageSection = "international" | "national" | "markets";

interface CatalogVisual extends EditorialVisual {
  keywords: string[];
  fallback?: boolean;
}

interface CommonsVisualInput {
  file: string;
  alt: string;
  source?: string;
  author: string;
  license: string;
  keywords: string[];
  fallback?: boolean;
}

interface ResolveVisualInput {
  section: FrontPageSection;
  id: string;
  title: string;
  tags?: string[];
  editorialVisual?: EditorialVisual;
}

const FED_KEYWORDS = ["fed","reserva federal","fomc","inflacion","ipc","ppi","tasa","tasas","politica monetaria","powell","yellen"];
const TREASURY_KEYWORDS = ["treasury","treasuries","bono","bonos","rendimiento","rendimientos","deuda","fiscal","curva","duracion"];
const ENERGY_KEYWORDS = ["petroleo","brent","wti","energia","hormuz","iran","golfo","buque","tanquero","opep","opec","transporte maritimo"];
const EQUITY_KEYWORDS = ["wall street","acciones","bolsa","s&p","nasdaq","dow","renta variable","mercado","mercados","indice","indices"];
const PORT_KEYWORDS = ["transporte","puerto","comercio","exportacion","importacion","logistica","flete","fletes","costo","costos","contenedores"];
const CHILE_ACTIVITY_KEYWORDS = ["santiago","economia","actividad","pib","imacec","empleo","vivienda","hipotecario","consumo","presupuesto","regulacion","inversion","empresas"];
const BCCH_KEYWORDS = ["banco central","banco central de chile","bcch","tpm","politica monetaria","inflacion","ipc","tasa","tasas","peso","dolar"];
const COPPER_KEYWORDS = ["cobre","mineria","minera","commodities","commodity","exportacion","chuquicamata","codelco"];
const ECB_KEYWORDS = ["bce","banco central europeo","ecb","eurozona","euro","lagarde","frankfurt","inflacion europea","tasas europa","politica monetaria europea"];
const CHINA_KEYWORDS = ["china","beijing","pekin","shanghai","pboC","banco popular de china","yuan","renminbi","asia","crecimiento chino","exportaciones chinas"];
const GLOBAL_TRADE_KEYWORDS = ["comercio global","comercio mundial","cadena de suministro","cadenas de suministro","contenedores","logistica","fletes","shipping","transporte maritimo","puerto","puertos","singapur","hamburgo"];
const FX_KEYWORDS = ["divisas","forex","euro","dolar","yen","yuan","tipo de cambio","moneda","monedas","dxy"];
const GOLD_KEYWORDS = ["oro","gold","metales preciosos","refugio","activo refugio","lingote","lingotes"];
const CHILE_INSTITUTION_KEYWORDS = ["gobierno","la moneda","presidencia","presidente","hacienda","ministerio de hacienda","congreso","senado","camara","reforma","proyecto de ley","ley","fiscal","presupuesto","tributaria","pensiones","regulacion"];
const CHILE_URBAN_KEYWORDS = ["empleo","vivienda","inmobiliario","departamentos","construccion","consumo","transporte","metro","actividad","santiago","ciudad","infraestructura"];

const CONFLICT_KEYWORDS = ["guerra","conflicto","ataque","bombardeo","misil","misiles","ejercito","militar","tropas","combate","invasion","ofensiva","defensa","frente","armas","seguridad"];
const HUMANITARIAN_KEYWORDS = ["ayuda humanitaria","humanitaria","refugiados","desplazados","evacuacion","alimentos","medicinas","asistencia","socorro","crisis humanitaria","onu","unhcr","emergencia"];
const DISASTER_KEYWORDS = ["terremoto","inundacion","incendio","huracan","desastre","catastrofe","emergencia","evacuacion","rescate","fema","tormenta"];
const CHILE_CONSTRUCTION_KEYWORDS = ["construccion","obra","obras","edificio","edificios","grua","gruas","inmobiliario","vivienda","infraestructura","proyecto urbano","permisos","desarrollo inmobiliario"];
const CHILE_JUSTICE_KEYWORDS = ["tribunal constitucional","corte suprema","poder judicial","justicia","tribunal","tribunales","constitucional","fallo","sentencia","recurso","judicial"];
const CHILE_MINISTRY_KEYWORDS = ["ministerio","minvu","vivienda","urbanismo","salud","educacion","defensa","medio ambiente","gobierno","estado","edificio publico"];

function commonsVisual({file,alt,source = "Wikimedia Commons",author,license,keywords,fallback = false}: CommonsVisualInput): CatalogVisual {
  const encodedFile = encodeURIComponent(file);
  return {src:`https://commons.wikimedia.org/wiki/Special:FilePath/${encodedFile}?width=1280`,alt,source,sourceUrl:`https://commons.wikimedia.org/wiki/File:${encodedFile}`,author,license,keywords,fallback};
}

function catalogVisual(file: string,alt: string,keywords: string[]): CatalogVisual {
  return commonsVisual({file,alt,author:"Crédito en ficha de origen",license:"Ver ficha de origen",keywords});
}

function catalogBatch(files: string[], alt: string, keywords: string[]) { return files.map((file) => catalogVisual(file, alt, keywords)); }

const FED_ECCLES = commonsVisual({file:"Eccles Building (26088200676).jpg",alt:"Entrada principal del edificio Marriner S. Eccles de la Reserva Federal en Washington, D.C.",source:"Wikimedia Commons / Federal Reserve",author:"Federalreserve",license:"Dominio público",keywords:FED_KEYWORDS,fallback:true});
const FED_FOMC_2016 = commonsVisual({file:"Federal Open Market Committee (FOMC) in Washington DC April 26-27, 2016.jpg",alt:"Participantes del FOMC reunidos en el edificio Marriner S. Eccles de la Reserva Federal.",source:"Wikimedia Commons / Federal Reserve",author:"Federalreserve",license:"Dominio público",keywords:FED_KEYWORDS});
const FED_FOMC_2014 = commonsVisual({file:"CY FOMC 031814-3066 (13272861314).jpg",alt:"Participantes del FOMC reunidos en Washington durante una sesión de política monetaria.",source:"Wikimedia Commons / Federal Reserve",author:"Federalreserve",license:"Dominio público",keywords:FED_KEYWORDS});
const FED_BOARD_2014 = commonsVisual({file:"FOMC BKL2522 (12620086523).jpg",alt:"Miembros y personal de la Reserva Federal reunidos en Washington, D.C.",source:"Wikimedia Commons / Federal Reserve",author:"Federalreserve",license:"Dominio público",keywords:FED_KEYWORDS});
const FED_RULES_2014 = commonsVisual({file:"FOMC D4A0475 (13724861975).jpg",alt:"Reunión de miembros y personal de la Reserva Federal en Washington, D.C.",source:"Wikimedia Commons / Federal Reserve",author:"Federalreserve",license:"Dominio público",keywords:FED_KEYWORDS});
const FED_FOMC_2014_ALT = commonsVisual({file:"FOMC D4A2647 (14242656921).jpg",alt:"Sesión de trabajo de la Reserva Federal vinculada a decisiones de política monetaria.",source:"Wikimedia Commons / Federal Reserve",author:"Federalreserve",license:"Dominio público",keywords:FED_KEYWORDS});
const FED_EXTRA = catalogBatch(["CB PC 032013 16066 (8577655358).jpg","CB PC 121212 DE 5197 (8548486247).jpg","CP FOMC Group 7.5x10 11142022 DSCF5769 (52563724010).jpg","FOMC D4A2699 (14306047845).jpg","FOMC D4A4501 (11439897774).jpg"],"Reserva Federal, FOMC o conducción de la política monetaria de Estados Unidos.",FED_KEYWORDS);

const TREASURY_BUILDING = commonsVisual({file:"US Treasury Building.jpg",alt:"Edificio del Departamento del Tesoro de Estados Unidos en Washington, D.C.",author:"Loren",license:"Dominio público",keywords:TREASURY_KEYWORDS,fallback:true});
const TREASURY_BUILDING_OFFICIAL = commonsVisual({file:"Treasury Building (32648233951).jpg",alt:"Edificio del Departamento del Tesoro de Estados Unidos visto desde Washington, D.C.",source:"Wikimedia Commons / U.S. Department of the Treasury",author:"U.S. Department of the Treasury",license:"Dominio público",keywords:TREASURY_KEYWORDS});
const TREASURY_EXTRA = catalogBatch(["Us-treasury-building.jpg","Department of the Treasury (15176010162).jpg","Department of the Treasury (53840295873).jpg","D.C., Washington, Treasury Building, 1898, Exterior LCCN96510891.jpg","D.C., Washington, Treasury Building, 1901, exterior LCCN96510935.jpg","D.C., Washington, Treasury Building, 1910, exterior LCCN96510906.jpg","D.C., Washington, Treasury Building, 1918, exterior showing Liberty Loan thermometer LCCN96510391.jpg","D.C., Washington, Treasury Building, exterior LCCN96510901.jpg"],"Departamento del Tesoro de Estados Unidos o contexto de deuda y renta fija.",TREASURY_KEYWORDS);

const GULF_CONVOY = commonsVisual({file:"USS Hawes (FFG-53), USS William H. Standley (CG-32) and USS Guadalcanal (LPH-7) escort tanker Gas King in the Persian Gullf on 21 October 1987 (6432283).jpg",alt:"Convoy de buques escoltando al petrolero Gas King en el Golfo Pérsico.",source:"Wikimedia Commons / U.S. National Archives",author:"PH2 Elliott, U.S. Navy",license:"Dominio público — gobierno federal de EE.UU.",keywords:ENERGY_KEYWORDS});
const GULF_OIL_TERMINAL = commonsVisual({file:"US Navy 051111-N-8163B-032 An oil tanker docked to the Al Basrah Oil Terminal (ABOT) takes on crude oil in the Persian Gulf.jpg",alt:"Petrolero cargando crudo en la terminal Al Basrah del Golfo Pérsico.",source:"Wikimedia Commons / U.S. Navy",author:"Eben Boothby, U.S. Navy",license:"Dominio público — gobierno federal de EE.UU.",keywords:ENERGY_KEYWORDS});
const ENERGY_EXTRA = catalogBatch(["US Navy 030629-N-4790M-003 Commercial oil tanker AbQaiq readies itself to receive oil at Mina-Al-Bkar Oil terminal (MABOT), an off shore Iraqi oil installation.jpg","US Navy 030629-N-4790M-006 Commercial oil tanker AbQaiq readies itself to receive oil at Mina-Al-Bkar Oil terminal (MABOT), an off shore Iraqi oil installation.jpg","US Navy 041207-N-6932B-014 The oil tanker Omala is one of hundreds of oil tankers from around the world that receives its payload from Iraq's Al Basrah Oil Terminal (ABOT).jpg","US Navy 030628-N-6077T-006 Commercial oil tanker AbQaiq is helped into position by tugboats prior to receiving crude oil.jpg","US Navy 030628-N-6077T-005 Commercial oil tanker AbQaiq readies itself to receive oil at Mina-Al-Bkar Oil terminal (MABOT) an off shore Iraqi oil installation.jpg","US Navy 051019-N-5088T-002 An F-14D Tomcat banks over an oil tanker while conducting a sunset maritime security mission over the Persian Gulf.jpg","US Navy 041020-N-1348L-037 The guided missile destroyer USS Preble (DDG 88) patrols the waters surrounding the Al Basrah Oil Terminal (ABOT) as a super tanker takes-on crude oil.jpg","US Navy 041020-N-1348L-054 The U.S. Coast Guard cutter Monomoy (WPB 1326) patrols the waters surrounding the Al Basrah Oil Terminal (ABOT) as a super tanker takes-on crude oil.jpg","Oil tanker Abqaiq in 2003.jpg","US Navy 030629-N-4790M-004 USS Chosin (CG 65) enforces an exclusionary perimeter as commercial oil tanker AbQaiq readies itself to receive oil at Mina-Al-Bkar Oil terminal (MABOT), an off shore Iraqi oil installation.jpg"],"Petróleo, buques tanque, terminales energéticos o transporte de crudo.",ENERGY_KEYWORDS);

const NYSE_HIGHSMITH = commonsVisual({file:"No Known Restrictions Trading Floor, New York Stock Exchange (Highsmith LOC) (6718386525).jpg",alt:"Piso de operaciones de la Bolsa de Nueva York fotografiado por Carol M. Highsmith.",source:"Library of Congress / Wikimedia Commons",author:"Carol M. Highsmith",license:"Dominio público",keywords:EQUITY_KEYWORDS});
const NYSE_HISTORIC_FLOOR = commonsVisual({file:"NY stock exchange traders floor LC-U9-10548-6.jpg",alt:"Corredores trabajando en el piso de operaciones de la Bolsa de Nueva York.",source:"Library of Congress / Wikimedia Commons",author:"Thomas J. O'Halloran",license:"Sin restricciones conocidas / dominio público en EE.UU.",keywords:EQUITY_KEYWORDS});
const NYSE_EXTERIOR = commonsVisual({file:"Stock Exchange NYC.jpg",alt:"Fachada de la Bolsa de Nueva York en Wall Street.",author:"Cody escadron delta",license:"Dominio público",keywords:EQUITY_KEYWORDS,fallback:true});
const NYSE_WALL_STREET = commonsVisual({file:"New York Stock Exchange, Wall Street 1.jpg",alt:"Fachada de la Bolsa de Nueva York en Wall Street, Nueva York.",author:"Mike Peel",license:"CC BY-SA 4.0",keywords:EQUITY_KEYWORDS});
const EQUITY_EXTRA = catalogBatch(["Stockexchange.jpg","NewYorkStockExchangeWallStreetManhattan.jpg","New York Stock Exchange (NYSE) in Wall Street.jpg","Wall Street - New York Stock Exchange.jpg","New York Stock Exchange, Wall Street.jpg","0603 KRBN-RobertEngle-JonDemske-10.jpg","0603 KRBN-RobertEngle-JonDemske-11.jpg","0603-Kraneshares KRBN-RobertEngle-JonDemske-12.jpg"],"Bolsa de Nueva York, Wall Street o actividad del mercado accionario.",EQUITY_KEYWORDS);

const PORT_SAN_ANTONIO = commonsVisual({file:"CL-san-antonio-hafen.jpg",alt:"Vista del puerto de San Antonio en Chile, con infraestructura portuaria y movimiento de carga.",author:"Balou46",license:"CC BY-SA 4.0",keywords:PORT_KEYWORDS});
const PORT_SAN_ANTONIO_PANORAMA = commonsVisual({file:"San Antonio Port (Chile).jpg",alt:"Vista panorámica del puerto de San Antonio en la Región de Valparaíso.",author:"Patricio Mecklenburg",license:"CC BY-SA 3.0",keywords:PORT_KEYWORDS});
const PORT_SAN_ANTONIO_CONTAINERS = commonsVisual({file:"Descarga contenedores san antonio terminal internacional.jpg",alt:"Operación de descarga de contenedores en el puerto de San Antonio, Chile.",author:"Cristiangonzalo.m",license:"CC BY-SA 3.0",keywords:PORT_KEYWORDS});
const PORT_EXTRA = catalogBatch(["San Antonio, Valparaiso Region, Chile - panoramio.jpg","SanAntonio11.jpg","Sanantonio3.jpg","SanAntonioChile.jpg","Santoniodelmar.jpg","Seguridad en el mar - Flickr - moralescv.jpg","Trabaenelpuerto.jpg"],"Puerto de San Antonio, logística, comercio exterior o actividad portuaria en Chile.",PORT_KEYWORDS);

const SANTIAGO_SKYLINE = commonsVisual({file:"Skyline of Santiago, Chile.jpg",alt:"Vista del skyline de Santiago de Chile.",source:"Wikimedia Commons / Unsplash",author:"Pablo García Saldaña",license:"CC0 1.0",keywords:CHILE_ACTIVITY_KEYWORDS,fallback:true});
const SANTIAGO_COSTANERA = commonsVisual({file:"Costanera Center.jpg",alt:"Vista del complejo Costanera Center en Santiago de Chile.",author:"AMeck",license:"CC BY-SA 3.0",keywords:CHILE_ACTIVITY_KEYWORDS});
const SANTIAGO_COSTANERA_CURRENT = commonsVisual({file:"Vista del Costanera Center.jpg",alt:"Vista urbana del Costanera Center en Santiago de Chile.",author:"Rjcastillo",license:"CC BY-SA 4.0",keywords:CHILE_ACTIVITY_KEYWORDS});
const SANTIAGO_EXTRA = catalogBatch(["Santiago Panorama.jpg","Santiago Skyline.jpg","Skyline of Santiago with San Cristóbal hill at the back (Northeast view 01).JPG","Skyline of Santiago with San Cristóbal hill at the back (Northeast view 02).JPG","Skyline of Santiago with San Cristóbal hill at the back (Northeast view Panorama 01 - Flat projection).jpg","Skyline of Santiago with San Cristóbal hill at the back (Northeast view Panorama 02 - Sphere projection).jpg","Skyline of Santiago with San Cristóbal hill at the back (Northeast view Panorama 03 - Flat projection).jpg","Stgo Abril.jpg","Torre-winter14 (16743359948).jpg"],"Santiago de Chile, actividad económica, inversión, consumo o entorno empresarial.",CHILE_ACTIVITY_KEYWORDS);

const BCCH_BUILDING = commonsVisual({file:"BancoCentralChile.JPG",alt:"Fachada del edificio del Banco Central de Chile en Santiago.",author:"Carlos yo",license:"CC BY 3.0",keywords:BCCH_KEYWORDS});
const BCCH_EXTERIOR = commonsVisual({file:"Vista exterior edificio BCCh (26986595731).jpg",alt:"Vista exterior del edificio del Banco Central de Chile en Santiago.",source:"Wikimedia Commons / Banco Central de Chile",author:"Banco Central de Chile",license:"CC0 1.0",keywords:BCCH_KEYWORDS,fallback:true});
const BCCH_EXTRA = catalogBatch(["Banco Central (3973681254).jpg","Fachada Banco Central (40807089604).jpg","Fachada Banco Central.jpg","Entrada Banco Central (34887472275).jpg","Detalle escudo Banco Central (34724274142).jpg","Edificio 1930 (27130012215).jpg","Edificio del Banco 1930 (26524138444).jpg","Sala de Consejo (26986595781).jpg","Hall Primer Piso (26779571090).jpg","Barras de oro (26960782102).jpg"],"Banco Central de Chile, política monetaria, reservas o contexto financiero local.",BCCH_KEYWORDS);

const COPPER_MINE = commonsVisual({file:"Chile copper mine.JPG",alt:"Vista aérea de una mina de cobre en Chile.",author:"Sebastian Kawa, Tomasz Kawa",license:"CC BY-SA 3.0",keywords:COPPER_KEYWORDS});
const COPPER_CHUQUICAMATA = commonsVisual({file:"Chuquicamata copper mine chile.jpg",alt:"Vista aérea de la mina de cobre Chuquicamata en el norte de Chile.",author:"Owen Cliffe",license:"CC BY-SA 3.0",keywords:COPPER_KEYWORDS});
const COPPER_EXTRA = catalogBatch(["Escondida Copper Mine, Atacama Desert, Chile 2009-12-09 lrg.jpg","Escondida Copper Mine, Atacama Desert, Chile 2009-12-09.jpg","Chiquicamata Mine, Chile (ASTER).jpg","Escondida Mine, Chile (ASTER).jpg","Escond-swir (ASTER).jpg","Chuquicamata copper mine - Chuquicamata-Kupfermine.jpg","Mina de Chuquicamata, Calama, Chile, 2016-02-01, DD 121.JPG","Chilean Miners.jpg"],"Cobre, minería chilena, Chuquicamata, Escondida o producción de commodities.",COPPER_KEYWORDS);

const ECB_BUILDING = commonsVisual({file:"European Central Bank building.jpg",alt:"Edificio sede del Banco Central Europeo en Fráncfort, Alemania.",author:"Tobiasi0",license:"CC BY-SA 4.0",keywords:ECB_KEYWORDS});
const ECB_SKYTOWER = commonsVisual({file:"Frankfurt am Main, Seat of the European Central Bank (Skytower (ECB)).jpg",alt:"Sede del Banco Central Europeo y su torre en Fráncfort, Alemania.",author:"Dr. Thomas Liptak",license:"CC BY-SA 4.0",keywords:ECB_KEYWORDS});
const PBOC_HEADQUARTER = commonsVisual({file:"People's Bank of China Headquarter, Beijing.jpg",alt:"Sede del Banco Popular de China en Pekín.",author:"Max12Max",license:"CC BY-SA 4.0",keywords:CHINA_KEYWORDS});
const PBOC_NEW_HEADQUARTER = commonsVisual({file:"Beijing PBC NewHQ.jpg",alt:"Edificio del Banco Popular de China en el distrito financiero de Pekín.",author:"Boubloub",license:"CC0 1.0",keywords:CHINA_KEYWORDS});
const SHANGHAI_PUDONG = commonsVisual({file:"Shanghai skyline Pudong.jpg",alt:"Skyline financiero de Pudong en Shanghái, China.",author:"Ernest Jourdier",license:"CC BY 4.0",keywords:CHINA_KEYWORDS});
const SINGAPORE_PORT = commonsVisual({file:"Port of Singapore (3777500194).jpg",alt:"Vista elevada del puerto de Singapur con grúas y terminales de contenedores.",author:"DearEdward",license:"CC BY 2.0",keywords:GLOBAL_TRADE_KEYWORDS});
const HAMBURG_CONTAINER_SHIP = commonsVisual({file:"Container ship MSC Tokyo - IMO 9318046 - moored at Container Terminal Burchardkai, Hamburg-9507.jpg",alt:"Buque portacontenedores MSC Tokyo atracado en una terminal del puerto de Hamburgo.",author:"Raimond Spekking",license:"CC BY-SA 4.0",keywords:GLOBAL_TRADE_KEYWORDS});
const EURO_BANKNOTES = commonsVisual({file:"All Euro banknotes.png",alt:"Conjunto de billetes de euro de distintas denominaciones y series.",author:"Bericht",license:"CC0 1.0",keywords:FX_KEYWORDS});
const GOLD_BULLION = commonsVisual({file:"Gold bullion bars.jpg",alt:"Conjunto de lingotes de oro apilados.",source:"Wikimedia Commons / Pixabay",author:"Stevebidmead",license:"CC0 1.0",keywords:GOLD_KEYWORDS});

const LA_MONEDA = commonsVisual({file:"Palacio de la Moneda, Santiago, Chile.JPG",alt:"Palacio de La Moneda, sede del Gobierno de Chile en Santiago.",author:"Enrique alfonso silva",license:"CC BY-SA 3.0",keywords:CHILE_INSTITUTION_KEYWORDS});
const CONGRESO_NACIONAL = commonsVisual({file:"Edificio del Congreso Nacional de Chile (Valparaíso).jpg",alt:"Edificio del Congreso Nacional de Chile en Valparaíso.",author:"ShootingStarMax",license:"CC BY-SA 4.0",keywords:CHILE_INSTITUTION_KEYWORDS});
const HACIENDA_HISTORIC = commonsVisual({file:"Edificio del Ministerio de Hacienda Chile (1932).JPG",alt:"Edificio del Ministerio de Hacienda de Chile en una imagen histórica del Barrio Cívico.",source:"Memoria Chilena / Wikimedia Commons",author:"En Viaje / Empresa de los Ferrocarriles del Estado",license:"Dominio público",keywords:CHILE_INSTITUTION_KEYWORDS});
const SANTIAGO_METRO = commonsVisual({file:"Metro de Santiago - Estación Escuela Militar.jpg",alt:"Andén de la estación Escuela Militar del Metro de Santiago.",author:"Corsario CL",license:"CC BY-SA 4.0",keywords:CHILE_URBAN_KEYWORDS});
const SANTIAGO_CENTER_BUILDINGS = commonsVisual({file:"Edificios Santiago centro.jpg",alt:"Edificios residenciales y urbanos en el centro de Santiago de Chile.",author:"Promeroy",license:"CC BY-SA 4.0",keywords:CHILE_URBAN_KEYWORDS});

const HUMANITARIAN_DISTRIBUTION = commonsVisual({file:"U S Army Soldiers Assist Panamanian Partners with Humanitarian Aid Distribution (9778658).jpg",alt:"Distribución de ayuda humanitaria y cajas de asistencia durante una operación regional.",source:"Wikimedia Commons / U.S. Southern Command",author:"Pfc. Oshon Trowbridge",license:"Dominio público — gobierno federal de EE.UU.",keywords:HUMANITARIAN_KEYWORDS});
const HUMANITARIAN_AID = commonsVisual({file:"Humanitarian aid DVIDS237445.jpg",alt:"Operación de entrega de ayuda humanitaria coordinada por personal militar.",source:"Wikimedia Commons / U.S. Army",author:"U.S. Army",license:"Dominio público — gobierno federal de EE.UU.",keywords:HUMANITARIAN_KEYWORDS});
const REFUGEE_ASSISTANCE = commonsVisual({file:"Desplazadoscol01.jpg",alt:"Asistencia humanitaria a personas refugiadas y desplazadas internas.",source:"Wikimedia Commons / U.S. Department of State",author:"U.S. Department of State",license:"Dominio público — gobierno federal de EE.UU.",keywords:HUMANITARIAN_KEYWORDS});
const HUMANITARIAN_AIRDROP = commonsVisual({file:"Humanitarian Aid Airdrops (8302678).jpg",alt:"Operación aérea de lanzamiento de ayuda humanitaria.",source:"Wikimedia Commons / U.S. Army",author:"U.S. Army",license:"Dominio público — gobierno federal de EE.UU.",keywords:HUMANITARIAN_KEYWORDS});
const FEMA_RELIEF = commonsVisual({file:"FEMA - 37694 - FEMA Disaster relief supplies staged in Louisiana.jpg",alt:"Suministros de emergencia y ayuda para desastres preparados por FEMA.",source:"Wikimedia Commons / FEMA",author:"FEMA",license:"Dominio público — gobierno federal de EE.UU.",keywords:DISASTER_KEYWORDS});
const WAR_DAMAGE = commonsVisual({file:"Mitrovica damaged buildings 1999.jpg",alt:"Edificios dañados por un conflicto armado en un entorno urbano.",source:"Wikimedia Commons / NATO",author:"NATO",license:"Dominio público",keywords:CONFLICT_KEYWORDS});
const WAR_DAMAGE_ALT = commonsVisual({file:"A War-damaged Building (BOND 0564).jpg",alt:"Edificio severamente dañado por acciones de guerra.",source:"Wikimedia Commons / U.S. Army",author:"Frank Bond",license:"Dominio público — gobierno federal de EE.UU.",keywords:CONFLICT_KEYWORDS});
const MILITARY_HUMANITARIAN = commonsVisual({file:"Soldiers search for weapons and give humanitarian aid DVIDS37090.jpg",alt:"Soldados durante una operación de seguridad y asistencia humanitaria.",source:"Wikimedia Commons / U.S. Department of Defense",author:"Spc. Olanrewaju Akinwunmi",license:"Dominio público — gobierno federal de EE.UU.",keywords:[...CONFLICT_KEYWORDS,...HUMANITARIAN_KEYWORDS]});

const CHILE_TC = commonsVisual({file:"Edificio Tribunal Constitucional Chile.jpg",alt:"Edificio del Tribunal Constitucional de Chile en Santiago.",author:"Warko",license:"CC BY-SA 4.0",keywords:CHILE_JUSTICE_KEYWORDS});
const CHILE_TC_2015 = commonsVisual({file:"Tribunal Constitucional de Chile, 2015.jpg",alt:"Sede del Tribunal Constitucional de Chile en Santiago.",author:"Warko",license:"CC BY-SA 4.0",keywords:CHILE_JUSTICE_KEYWORDS});
const MINVU_BUILDING = commonsVisual({file:"Edificio del Ministerio de Vivienda y Urbanismo, Santiago 20230306.jpg",alt:"Edificio del Ministerio de Vivienda y Urbanismo en Santiago.",author:"Carlos yo",license:"CC BY-SA 4.0",keywords:CHILE_MINISTRY_KEYWORDS});
const CHILE_CONSTRUCTION_PROVIDENCIA = commonsVisual({file:"Construcción edificio, Providencia, Santiago 20240820.jpg",alt:"Construcción de un edificio en Providencia, Santiago.",author:"Carlos yo",license:"CC BY-SA 4.0",keywords:CHILE_CONSTRUCTION_KEYWORDS});
const CHILE_CONSTRUCTION_GAM = commonsVisual({file:"2017 Santiago de Chile - Construcción del Centro Gabriela Mistral (GAM) - Avenida Libertador Bernardo O'Higgins 227.jpg",alt:"Obras de construcción del Centro Gabriela Mistral en Santiago.",author:"Dietmar Rabich",license:"CC BY-SA 4.0",keywords:CHILE_CONSTRUCTION_KEYWORDS});
const CHILE_COSTANERA_CONSTRUCTION = commonsVisual({file:"Costanera Center en construcción (2008-12-3), 2.jpg",alt:"Construcción del complejo Costanera Center en Santiago.",source:"Wikimedia Commons / Flickr",author:"B1mbo",license:"CC BY-SA 2.0",keywords:CHILE_CONSTRUCTION_KEYWORDS});
const CHILE_CCHC = commonsVisual({file:"Edificio Cámara Chilena de la Construcción, Las Condes, Santiago 20220417.jpg",alt:"Edificio de la Cámara Chilena de la Construcción en Las Condes, Santiago.",author:"Carlos yo",license:"CC BY-SA 4.0",keywords:CHILE_CONSTRUCTION_KEYWORDS});
const SANTIAGO_OFFICE_BUILDING = commonsVisual({file:"Building in Santiago de Chile.jpg",alt:"Edificio de oficinas en Las Condes, Santiago de Chile.",source:"Wikimedia Commons / Flickr",author:"Jimmy Baikovicius",license:"CC BY-SA 2.0",keywords:CHILE_URBAN_KEYWORDS});
const SANTIAGO_CCU_BUILDING = commonsVisual({file:"CCU building in Santiago.jpg",alt:"Edificio corporativo de CCU en Santiago de Chile.",author:"Usuario de Wikimedia Commons",license:"CC BY-SA 4.0",keywords:CHILE_URBAN_KEYWORDS});
const PLAZA_CONSTITUCION = commonsVisual({file:"Plaza de la Constitución Chile.jpg",alt:"Plaza de la Constitución y edificios del centro cívico de Santiago.",author:"Usuario de Wikimedia Commons",license:"CC BY-SA 4.0",keywords:CHILE_INSTITUTION_KEYWORDS});

const FED_VISUALS = [FED_ECCLES,FED_FOMC_2016,FED_FOMC_2014,FED_BOARD_2014,FED_RULES_2014,FED_FOMC_2014_ALT,...FED_EXTRA];
const TREASURY_VISUALS = [TREASURY_BUILDING,TREASURY_BUILDING_OFFICIAL,...TREASURY_EXTRA];
const ENERGY_VISUALS = [GULF_CONVOY,GULF_OIL_TERMINAL,...ENERGY_EXTRA];
const EQUITY_VISUALS = [NYSE_HIGHSMITH,NYSE_HISTORIC_FLOOR,NYSE_EXTERIOR,NYSE_WALL_STREET,...EQUITY_EXTRA];
const PORT_VISUALS = [PORT_SAN_ANTONIO,PORT_SAN_ANTONIO_PANORAMA,PORT_SAN_ANTONIO_CONTAINERS,...PORT_EXTRA];
const SANTIAGO_VISUALS = [SANTIAGO_SKYLINE,SANTIAGO_COSTANERA,SANTIAGO_COSTANERA_CURRENT,...SANTIAGO_EXTRA];
const BCCH_VISUALS = [BCCH_BUILDING,BCCH_EXTERIOR,...BCCH_EXTRA];
const COPPER_VISUALS = [COPPER_MINE,COPPER_CHUQUICAMATA,...COPPER_EXTRA];
const ECB_VISUALS = [ECB_BUILDING,ECB_SKYTOWER];
const CHINA_VISUALS = [PBOC_HEADQUARTER,PBOC_NEW_HEADQUARTER,SHANGHAI_PUDONG];
const GLOBAL_TRADE_VISUALS = [SINGAPORE_PORT,HAMBURG_CONTAINER_SHIP];
const FX_VISUALS = [EURO_BANKNOTES];
const GOLD_VISUALS = [GOLD_BULLION];
const CHILE_INSTITUTION_VISUALS = [LA_MONEDA,CONGRESO_NACIONAL,HACIENDA_HISTORIC,PLAZA_CONSTITUCION];
const CHILE_URBAN_VISUALS = [SANTIAGO_METRO,SANTIAGO_CENTER_BUILDINGS,SANTIAGO_OFFICE_BUILDING,SANTIAGO_CCU_BUILDING];
const CONFLICT_VISUALS = [WAR_DAMAGE,WAR_DAMAGE_ALT,MILITARY_HUMANITARIAN];
const HUMANITARIAN_VISUALS = [HUMANITARIAN_DISTRIBUTION,HUMANITARIAN_AID,REFUGEE_ASSISTANCE,HUMANITARIAN_AIRDROP,MILITARY_HUMANITARIAN];
const DISASTER_VISUALS = [FEMA_RELIEF];
const CHILE_JUSTICE_VISUALS = [CHILE_TC,CHILE_TC_2015];
const CHILE_MINISTRY_VISUALS = [MINVU_BUILDING];
const CHILE_CONSTRUCTION_VISUALS = [CHILE_CONSTRUCTION_PROVIDENCIA,CHILE_CONSTRUCTION_GAM,CHILE_COSTANERA_CONSTRUCTION,CHILE_CCHC];

const VISUAL_CATALOG: Record<FrontPageSection, CatalogVisual[]> = {
  international: [...FED_VISUALS,...TREASURY_VISUALS,...ENERGY_VISUALS,...EQUITY_VISUALS,...ECB_VISUALS,...CHINA_VISUALS,...GLOBAL_TRADE_VISUALS,...CONFLICT_VISUALS,...HUMANITARIAN_VISUALS,...DISASTER_VISUALS],
  national: [...PORT_VISUALS,...SANTIAGO_VISUALS,...BCCH_VISUALS,...COPPER_VISUALS,...CHILE_INSTITUTION_VISUALS,...CHILE_URBAN_VISUALS,...CHILE_JUSTICE_VISUALS,...CHILE_MINISTRY_VISUALS,...CHILE_CONSTRUCTION_VISUALS],
  markets: [...EQUITY_VISUALS,...FED_VISUALS,...TREASURY_VISUALS,...ENERGY_VISUALS,...COPPER_VISUALS,...ECB_VISUALS,...CHINA_VISUALS,...GLOBAL_TRADE_VISUALS,...FX_VISUALS,...GOLD_VISUALS],
};

export const FRONT_PAGE_VISUAL_CATALOG_SIZE = new Set(Object.values(VISUAL_CATALOG).flat().map(({ src }) => src)).size;

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function stableHash(value: string) { let hash = 2166136261; for (const character of value) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
const FRONT_PAGE_SECTIONS: FrontPageSection[] = ["international","national","markets"];
function sectionOwnsSharedVisual(section: FrontPageSection, visual: CatalogVisual) { const eligibleSections = FRONT_PAGE_SECTIONS.filter((candidateSection) => VISUAL_CATALOG[candidateSection].some((candidate) => candidate.src === visual.src)); if (eligibleSections.length <= 1) return true; const ownerIndex = stableHash(visual.src) % eligibleSections.length; return eligibleSections[ownerIndex] === section; }
function stripCatalogMetadata(visual: CatalogVisual): EditorialVisual { const {keywords:_keywords,fallback:_fallback,...editorialVisual} = visual; return editorialVisual; }
export function resolveFrontPageVisual({section,id,title,tags = [],editorialVisual}: ResolveVisualInput): EditorialVisual {
  if (editorialVisual) return editorialVisual;
  const catalogPool = VISUAL_CATALOG[section];
  const ownedPool = catalogPool.filter((visual) => sectionOwnsSharedVisual(section, visual));
  const pool = ownedPool.length > 0 ? ownedPool : catalogPool;
  const haystack = normalize(`${title} ${tags.join(" ")}`);
  const scored = pool.map((visual) => ({visual,score:visual.keywords.reduce((total, keyword) => total + (haystack.includes(normalize(keyword)) ? 1 : 0),0)}));
  const bestScore = Math.max(...scored.map(({ score }) => score));
  const matchedCandidates = scored.filter(({ score }) => score === bestScore && score > 0).map(({ visual }) => visual);
  const fallbackCandidates = pool.filter(({ fallback }) => fallback);
  const candidates = matchedCandidates.length > 0 ? matchedCandidates : fallbackCandidates.length > 0 ? fallbackCandidates : pool;
  const rotationKey = `${section}:${id}`;
  const selected = candidates[stableHash(rotationKey) % candidates.length] ?? pool[0];
  return stripCatalogMetadata(selected);
}
