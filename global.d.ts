/// <reference types="vite/client" />

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- must be an interface to merge with vite/client's ImportMetaEnv
interface ImportMetaEnv {
  readonly SITE_URL: string;
  readonly BUILD_ID: string;
  readonly GOATCOUNTER_URL: string;
}
