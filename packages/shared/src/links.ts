/**
 * Public links shared by the extension and the web companion (P18c). No tracking parameters.
 */

/** Store listings (the install buttons and the invite message). */
export const INSTALL_LINKS = {
  firefox: 'https://addons.mozilla.org/en-US/firefox/addon/studylens/',
  edge: 'https://microsoftedge.microsoft.com/addons/detail/studylens/phepgpemnllainhhjemgknaeedjjekad',
} as const;

/** The web companion (landing page, privacy policy, live rooms). Also the manifest homepage. */
export const WEBSITE_URL = 'https://studylens-flame.vercel.app';

/** Source code and issues. */
export const GITHUB_URL = 'https://github.com/haygens/studylens';

/**
 * hs's anonymous Microsoft Form (no names or emails asked). "Send feedback" only opens it in a new
 * tab: nothing is sent or filled in. Empty = hidden everywhere.
 */
export const FEEDBACK_URL =
  'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=DQSIkWdsW0yxEjajBLZtrQAAAAAAAAAAAANAATtyGOdURDg4VUNBRFRSRjgwMktVWEFEODMxTDk0Qi4u';
