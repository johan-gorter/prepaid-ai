// Dutch message catalog, assembled from per-domain modules. Each module is
// typed against its English counterpart, and the merged object is typed as
// `MessageSchema`, so the build fails if any key present in the English
// catalog is missing here. The runtime key-parity test in
// `ct/i18n-key-parity.ct.ts` guards against the reverse (extra keys) too.
import type { MessageSchema } from "../en";
import common from "./common";
import main from "./main";
import chat from "./chat";
import newImpression from "./newImpression";
import firstRenovation from "./firstRenovation";
import buyCredits from "./buyCredits";
import login from "./login";
import legal from "./legal";

const nl: MessageSchema = {
  ...common,
  ...main,
  ...chat,
  ...newImpression,
  ...firstRenovation,
  ...buyCredits,
  ...login,
  ...legal,
};

export default nl;
