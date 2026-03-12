// Maps normalized shorthand to canonical normalized org name
export const ORG_SHORTHAND_MAP = new Map<string, string>([
  // CFTC
  ["cftc", "commodity futures trading commission"],
  ["commodity futures trading commission", "commodity futures trading commission"],

  // SEC
  ["sec", "securities and exchange commission"],
  ["securities and exchange commission", "securities and exchange commission"],

  // Federal Reserve
  ["federal reserve", "federal reserve system"],
  ["fed", "federal reserve system"],
  ["federal reserve board", "federal reserve system"],
  ["board of governors", "federal reserve system"],
  ["federal reserve system", "federal reserve system"],

  // Treasury
  ["treasury", "us department of treasury"],
  ["us treasury", "us department of treasury"],
  ["treasury department", "us department of treasury"],
  ["department of treasury", "us department of treasury"],
  ["us department of treasury", "us department of treasury"],

  // OCC
  ["occ", "office of comptroller of currency"],
  ["office of comptroller of currency", "office of comptroller of currency"],

  // FDIC
  ["fdic", "federal deposit insurance corporation"],
  ["federal deposit insurance corporation", "federal deposit insurance corporation"],

  // FHFA
  ["fhfa", "federal housing finance agency"],
  ["federal housing finance agency", "federal housing finance agency"],

  // FCA
  ["fca", "farm credit administration"],
  ["farm credit administration", "farm credit administration"],

  // NCUA
  ["ncua", "national credit union administration"],
  ["national credit union administration", "national credit union administration"],

  // FTC
  ["ftc", "federal trade commission"],
  ["federal trade commission", "federal trade commission"],

  // CFPB
  ["cfpb", "consumer financial protection bureau"],
  ["consumer financial protection bureau", "consumer financial protection bureau"],

  // DOJ
  ["doj", "department of justice"],
  ["department of justice", "department of justice"],

  // Senate Ag
  ["senate ag", "senate committee on agriculture nutrition and forestry"],
  ["senate agriculture", "senate committee on agriculture nutrition and forestry"],
  ["senate committee on agriculture nutrition and forestry", "senate committee on agriculture nutrition and forestry"],

  // Senate Banking
  ["senate banking", "senate committee on banking housing and urban affairs"],
  ["senate committee on banking housing and urban affairs", "senate committee on banking housing and urban affairs"],

  // House Ag
  ["house ag", "house committee on agriculture"],
  ["house agriculture", "house committee on agriculture"],
  ["house committee on agriculture", "house committee on agriculture"],

  // House Financial Services
  ["house financial services", "house committee on financial services"],
  ["house committee on financial services", "house committee on financial services"],

  // CME Group
  ["cme", "cme group"],
  ["cme group", "cme group"],
  ["chicago mercantile exchange", "cme group"],

  // ICE
  ["ice", "intercontinental exchange"],
  ["intercontinental exchange", "intercontinental exchange"],

  // DTCC
  ["dtcc", "depository trust and clearing corporation"],
  ["depository trust and clearing corporation", "depository trust and clearing corporation"],
]);

// Canonical org name (display name) for each normalized canonical
export const CANONICAL_DISPLAY_NAMES = new Map<string, string>([
  ["commodity futures trading commission", "Commodity Futures Trading Commission"],
  ["securities and exchange commission", "Securities and Exchange Commission"],
  ["federal reserve system", "Federal Reserve System"],
  ["us department of treasury", "U.S. Department of the Treasury"],
  ["office of comptroller of currency", "Office of the Comptroller of the Currency"],
  ["federal deposit insurance corporation", "Federal Deposit Insurance Corporation"],
  ["federal housing finance agency", "Federal Housing Finance Agency"],
  ["farm credit administration", "Farm Credit Administration"],
  ["national credit union administration", "National Credit Union Administration"],
  ["federal trade commission", "Federal Trade Commission"],
  ["consumer financial protection bureau", "Consumer Financial Protection Bureau"],
  ["department of justice", "Department of Justice"],
  ["senate committee on agriculture nutrition and forestry", "Senate Committee on Agriculture, Nutrition, and Forestry"],
  ["senate committee on banking housing and urban affairs", "Senate Committee on Banking, Housing, and Urban Affairs"],
  ["house committee on agriculture", "House Committee on Agriculture"],
  ["house committee on financial services", "House Committee on Financial Services"],
  ["cme group", "CME Group"],
  ["intercontinental exchange", "Intercontinental Exchange"],
  ["depository trust and clearing corporation", "Depository Trust & Clearing Corporation"],
]);
