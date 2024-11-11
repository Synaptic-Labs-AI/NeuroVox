# NeuroVox

NeuroVox is an Obsidian plugin that enhances your note-taking with voice transcription and AI capabilities. Simply insert a special code block to record your voice, transcribe it, and apply custom AI prompts to the transcription.

## Features

- **Voice Recording**: Insert a code block with three backticks, the word `record`, and three backticks again. A mic icon will appear in your note, which you can press to record.
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

### Steps to Get an OpenAI API Key

1. **Create an Account**:
    - Visit the [OpenAI website](https://www.openai.com) and sign up for an account.

2. **Access API Keys**:
    - Log in to your OpenAI account.
    - Click on your profile icon in the top right corner and select "API Keys" from the dropdown menu.
      ![Access API Keys](path/to/access-api-keys.png)
      *Image showing the dropdown menu to access API Keys.*

3. **Create a New Key**:
    - On the API Keys page, click "Create new secret key."
      ![Create New Secret Key](path/to/create-new-key.png)
      *Image showing the button to create a new secret key.*

4. **Secure Your API Key**:
    - Copy the newly generated API key and save it in a secure location. Treat this key like a password and do not share it with anyone.
      ![Secure API Key](path/to/secure-api-key.png)
      *Image showing copying and saving the API key securely.*

5. **Billing Information**:
    - Note that you need to add billing information to your OpenAI account to make API calls. You start with a $5 credit, but further usage will be billed according to OpenAI's pricing.
      ![Billing Information](path/to/billing-info.png)
      *Image showing where to add billing information.*

### Important Notes

- **Security**: Do not share your API key with anyone. Treat it as your personal password for accessing OpenAI services.
- **Usage Costs**: Be aware of the costs associated with API usage.

## Contribution

Contributions are welcome! Please fork the repository, make your changes, and open a pull request.

## Support

For support or to report issues, use the GitHub Issues page for this repository.

## Acknowledgments

Special thanks to:
- **James Griffing** (GitHub: [Forgetabyteit](https://github.com/Forgetabyteit))
- **David Youngblood** (GitHub: [LouminAI](https://github.com/thedavidyoungblood))
