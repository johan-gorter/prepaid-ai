// English message catalog, assembled from per-domain modules. The merged
// object is the schema source of truth: its shape is exported as
// `MessageSchema` and every other locale is typed against it, so `vue-tsc -b`
// fails the build if a translation key is missing. Each domain lives in its
// own file to keep diffs small and avoid merge conflicts when many features
// touch the catalog at once.
import common from "./common";
import main from "./main";
import chat from "./chat";
import newImpression from "./newImpression";
import firstRenovation from "./firstRenovation";
import buyCredits from "./buyCredits";
import login from "./login";
import about from "./about";

const en = {
  ...common,
  ...main,
  ...chat,
  ...newImpression,
  ...firstRenovation,
  ...buyCredits,
  ...login,
  ...about,
};

export type MessageSchema = typeof en;
export default en;
