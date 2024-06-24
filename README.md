# NeuroVox

NeuroVox is an Obsidian plugin that enhances your note-taking with voice transcription and AI capabilities. Simply insert a special code block to record your voice, transcribe it, and apply custom AI prompts to the transcription.

## Features

- **Voice Recording**: Insert a code block with three backticks, the word `return`, and three backticks again. A mic icon will appear in your note, which you can press to record.
- **Transcription**: Automatically transcribes your voice recordings using the [OpenAI Whisper API](https://openai.com/index/whisper/).
- **Custom Prompts**: Apply custom prompts to the transcription to summarize, extract to-dos, or other actions.
- **Audio Playback**: Embeds the audio file in your note for easy access.
- **Embedded Output**: Transcriptions and AI-generated outputs are embedded in your note with headings.

## Installation

1. Download the NeuroVox plugin.
2. Move the plugin files to your Obsidian plugins directory (.obsidian/plugins).
3. Enable the plugin from the Obsidian settings by toggling it on.
4. Input your OpenAI API key.

## Usage

1. **Recording**:
    - Insert a code block with three backticks, the word `return`, and three backticks again.
      ```record
      ```

https://github.com/Synaptic-Labs-AI/NeuroVox/assets/131487882/bc298d89-f360-46ae-bd07-8a7edfc2d1be


    - ![Inserting the Code Block](path/to/inserting-code-block.gif)
      *GIF showing the process of typing three backticks, `return`, and three backticks again in Obsidian.*
    - Click the microphone icon to start recording.
    - ![Recording Audio](path/to/recording-audio.gif)
      *GIF showing clicking the microphone icon and the live spectrogram waveform.*
2. **Transcription**:
    - The plugin automatically transcribes your recording.
    - ![Transcription Process](path/to/transcription-process.gif)
      *GIF displaying the transcription appearing in the note.*
3. **Applying Prompts**:
    - Use custom prompts to process the transcription.
    - ![Applying Custom Prompts](path/to/applying-prompts.gif)
      *GIF showing applying a custom prompt to the transcription and the resulting output.*
4. **Embedded Output**:
    - The transcription and AI-generated content are embedded in your note with headings.
    - ![Embedded Output](path/to/embedded-output.png)
      *Image showing the final embedded transcription and AI-generated content in the note.*

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
- **Usage Costs**: Be aware of the costs associated with API usage. OpenAI provides initial credit, but continued use will incur charges based on your data usage.

## Contribution

Contributions are welcome! Please fork the repository, make your changes, and open a pull request.

## Support

For support or to report issues, use the GitHub Issues page for this repository.

## Roadmap

- Add personalization options.
- Improve the user interface for easier configuration.
- Extend functionality with more AI-driven features.
- Add dynamic frontmatter generation

## Acknowledgments

Special thanks to:
- **James Griffin** (GitHub: [Forgetabyteit](https://github.com/Forgetabyteit))
- **David Youngblood** (GitHub: [LouminAI](https://github.com/thedavidyoungblood))
