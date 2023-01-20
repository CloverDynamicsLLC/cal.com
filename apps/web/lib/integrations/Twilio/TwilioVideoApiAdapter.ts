import { Credential } from "@prisma/client";
import twilio from "twilio";

import { handleErrorsJson, handleErrorsRaw } from "@lib/errors";
import { PartialReference } from "@lib/events/EventManager";
import prisma from "@lib/prisma";
import { randomString } from "@lib/random";
import { VideoApiAdapter, VideoCallData } from "@lib/videoClient";

import { CalendarEvent } from "../calendar/interfaces/Calendar";

/** @link https://marketplace.zoom.us/docs/api-reference/zoom-api/meetings/meetingcreate */
export interface TwillioEventResult {
  account_sid: string;
  date_created: string;
  date_updated: string;
  status: string;
  type: string;
  sid: string;
  enable_turn: boolean;
  unique_name: string;
  max_participants: number;
  max_participant_duration: number;
  max_concurrent_published_tracks: boolean;
  duration: number;
  status_callback_method: string;
  status_callback: null;
  record_participants_on_connect: false;
  video_codecs: Array<string>;
  audio_only: false;
  media_region: string;
  empty_room_timeout: 5;
  unused_room_timeout: 5;
  end_time: string;
  url: string;
  links: {
    participants: string;
    recordings: string;
    recording_rules: string;
  };
}

export const FAKE_TWILIO_CREDENTIAL: Credential = {
  id: +new Date().getTime(),
  type: "twilio_video",
  key: { apikey: randomString(12) },
  userId: +new Date().getTime(),
};

const TwilioVideoApiAdapter = (): VideoApiAdapter => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const client = twilio(accountSid, authToken);
  console.log(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return {
    getAvailability: () => {
      return Promise.resolve([]);
    },
    createMeeting: async (): Promise<VideoCallData> => {
      let urlT = "";
      let endDate = new Date(Date.now() + 4 * (60 * 60 * 1000));
      await client.video.rooms
        .create({ uniqueName: "we2ee2", maxParticipants: 2, maxParticipantDuration: 14400 })
        .then((room) => {
          urlT = room.url;
          console.log(room);
        })
        .catch((err) => console.log(err));
      return Promise.resolve({
        type: "twilio_video",
        id: "" as string,
        password: "",
        url: urlT,
      });
    },
    deleteMeeting: async (): Promise<void> => {
      Promise.resolve();
    },
    updateMeeting: (bookingRef: PartialReference): Promise<VideoCallData> => {
      return Promise.resolve({
        type: "huddle01_video",
        id: bookingRef.meetingId as string,
        password: bookingRef.meetingPassword as string,
        url: bookingRef.meetingUrl as string,
      });
    },
  };
};
// const TwilioVideoApiAdapter = (): VideoApiAdapter => {
//   const accountSid = process.env.TWILIO_ACCOUNT_SID;
//   const authToken = process.env.TWILIO_AUTH_TOKEN;
//   const client = twilio(accountSid, authToken);

//   return {
//     getAvailability: () => {
//       return Promise.resolve([]);
//     },
//     createMeeting: async (): Promise<VideoCallData> => {
//       console.log("create");
//       let urlT = "";

//       console.log("create");
//       await client.video.rooms
//         .create({ uniqueName: "we2ee2" })
//         .then((room) => (urlT = room.url))
//         .catch((err) => console.log(err));
//       return Promise.resolve({
//         type: "twilio_video",
//         id: "" as string,
//         password: "",
//         url: urlT,
//       });
//     },
//     deleteMeeting: async (uid: string): Promise<void> => {
//       const accessToken = "";

//       await fetch("https://api.zoom.us/v2/meetings/" + uid, {
//         method: "DELETE",
//         headers: {
//           Authorization: "Bearer " + accessToken,
//         },
//       }).then(handleErrorsRaw);

//       return Promise.resolve();
//     },
//     updateMeeting: async (bookingRef: PartialReference, event: CalendarEvent): Promise<VideoCallData> => {
//       const accessToken = "";

//       console.log(6);
//       await fetch("https://api.zoom.us/v2/meetings/" + bookingRef.uid, {
//         method: "PATCH",
//         headers: {
//           Authorization: "Bearer " + accessToken,
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify(event),
//       }).then(handleErrorsRaw);

//       return Promise.resolve({
//         type: "zoom_video",
//         id: bookingRef.meetingId as string,
//         password: bookingRef.meetingPassword as string,
//         url: bookingRef.meetingUrl as string,
//       });
//     },
//   };
// };

export default TwilioVideoApiAdapter;
