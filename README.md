# NeuroVox

NeuroVox is an Obsidian plugin that enhances your note-taking with voice transcription and AI capabilities. Record your voice, transcribe it, and apply custom AI prompts to the transcription.

## Features

- **Voice Recording**: A mic icon will appear in your note, which you can press to record.
- **Transcription**: Automatically transcribes your voice recordings using the [OpenAI Whisper API](https://openai.com/index/whisper/) along with Groq.
- **Custom Prompts**: Apply custom prompts to the transcription to summarize, extract to-dos, or other actions.
- **Audio Playback**: Embeds the audio file in your note for easy access.
- **Embedded Output**: Transcriptions and AI-generated outputs are embedded in your notes as callouts wherever your cursor is.

## Installation

1. Download the NeuroVox plugin from Community Plugins.
2. Enable the plugin from the Obsidian settings by toggling it on.
3. Input your OpenAI and/or Groq API Key (instructions below).
4. Choose a folder to save the Recordings.
5. Turn on the Floating Button Mic (optional), or otherwise use the toolbar icon or command pallette to start a recording.

## API Key Setup

If you need to obtain an OpenAI API key, follow the steps below:

### Steps to Get an API Key

1. **Create an Account**:
    - Visit the [OpenAI website](https://platform.openai.com) and sign up for an account.
    - Or visit the [Groq website](https://console.groq.com/) to get an account there.

2. **Access API Keys**:
    - Log in to your account.
    - **OpenAI**: Click on the ⚙️ in the top right corner and select "API Keys" from the dropdown menu.
    - **Groq**: Click "API Keys" on the left sidebar.

3. **Create a New Key**:
    - On the API Keys page, click "Create new secret key."

4. **Secure Your API Key**:
    - Copy the newly generated API key into the "🔌 AI Provider Keys" accordion in the Neurovox Settings. Treat this key like a password and do not share it with anyone.

5. **Billing Information**:
    - You need to add billing information to your OpenAI account to make API calls.
    - Groq is currently free.

## Roadmap
- [ ] Allow users to customize the callouts (titles and collapsed/uncollapsed default)
- [ ] Allow users to decide whether or not to keep the recording
- [ ] Improve ability to transcribe videos
- [ ] Add chunking of audio to do unlimited length and size files

## Contribution

Contributions are welcome! Please fork the repository, make your changes, and open a pull request.

## Support

For support or to report issues, use the GitHub Issues page for this repository.

## Acknowledgments

Special thanks to:
- **James Griffing** (GitHub: [Forgetabyteit](https://github.com/Forgetabyteit))
- **David Youngblood** (GitHub: [LouminAI](https://github.com/thedavidyoungblood))
