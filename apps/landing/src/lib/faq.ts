export interface FaqItem {
  question: string;
  answer: string;
}

/** Plain answers, taken from what the project promises. Nothing here is a claim the app cannot keep. */
export const FAQ: readonly FaqItem[] = [
  {
    question: 'Is Scrim free?',
    answer:
      'Yes. Scrim is free and open source under the MIT license. There is no subscription and no watermark on your exports.',
  },
  {
    question: 'Do I need to sign up?',
    answer:
      'No. Scrim has no account and no sign in, so you can start recording as soon as it is installed. The download form asks for your name and email so downloads can be counted, and that is all.',
  },
  {
    question: 'Are my videos saved to the cloud?',
    answer:
      'No. Your videos are saved in a folder on your computer, and nothing is uploaded, synced or shared unless you choose to send the exported file yourself. The only network request the app may make is an optional check for a newer version on GitHub.',
  },
  {
    question: 'Which systems does it run on?',
    answer:
      'Windows, macOS and Linux. On Linux, cursor effects and auto zoom need an X11 session. Under Wayland you can still record, and Scrim tells you why those two effects are off.',
  },
  {
    question: 'How does auto zoom work?',
    answer:
      'While you record, Scrim logs where the mouse moves and clicks. When you stop, it plans a camera path that zooms in around bursts of clicks, follows the cursor and eases back out. The plan is applied when you export, so you can change it afterwards.',
  },
  {
    question: 'Can I control the zoom, or turn it off?',
    answer:
      'Yes. Set the zoom level from 1.2 times to 3 times, how long it holds after a click and how smooth it feels, or switch auto zoom off completely.',
  },
  {
    question: 'Can I record my face and my voice?',
    answer:
      'Yes. Your camera records as its own track in a bubble you can drag, resize and snap to a corner. The microphone has its own switch, so you decide when it is on.',
  },
  {
    question: 'Where are my recordings saved?',
    answer:
      'In the folder you choose. Footage is written to disk while you record, so if the app or your computer crashes, Scrim offers to recover the recording the next time it opens.',
  },
  {
    question: 'Will editing change my original recording?',
    answer:
      'No. Trims and cuts are saved in a small edit list next to the recording. Your original file is never modified.',
  },
  {
    question: 'What does it export?',
    answer:
      'An MP4 with H.264 video and AAC sound, which plays almost everywhere. You choose the resolution, frame rate and quality, and where the file goes.',
  },
  {
    question: 'Can I take screenshots?',
    answer:
      'Yes. Capture a full display, a region or a single window as a PNG, then save it to your folder or copy it to the clipboard.',
  },
  {
    question: 'What does this website collect?',
    answer:
      'Only what the download form needs: your name, your email, the system you chose, the app version, a hashed copy of your IP address and a shortened browser string. There is no analytics, no tracking cookies and no third party scripts. The privacy page has the details.',
  },
];
