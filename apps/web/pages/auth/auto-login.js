import React, {useEffect} from "react";
import {signIn} from "next-auth/react";
import {useRouter} from "next/router";

const callbackUrl = '/availability';
const fetchUrl = '/api/auth/employer-credentials';

export default function AutoLogin() {
  const router = useRouter();
  const { employerId } = router.query;

  const isServer = typeof window === "undefined";

  const login = async () => {
    if (!employerId) {
      return <></>;
    }
    const credentials = await fetch(`${fetchUrl}?employerId=${employerId}`)
      .then((res) => res.json());
    try {
      const response = await signIn("credentials", {
        ...credentials,
        autoLoginEmployer: true,
        redirect: false,
        totpCode: null,
        callbackUrl,
      });
      if (!response) {
        throw new Error("Received empty response from next auth");
      }
      if (!response.error) {
        // we're logged in! let's do a hard refresh to the desired url
        window.location.replace(callbackUrl);
        return <></>;
      }
    } catch (e) {
      console.log(e);
    }
  }

  useEffect(() => {
    !isServer && login();
  }, [isServer]);

  return <></>;
}
