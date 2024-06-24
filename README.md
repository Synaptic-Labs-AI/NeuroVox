# NeuroVox

NeuroVox is an Obsidian plugin that enhances your note-taking with voice transcription and AI capabilities. Simply insert a special code block to record your voice, transcribe it, and apply custom AI prompts to the transcription.

## Features

- **Voice Recording**: Insert a code block with three backticks, the word `record`, and three backticks again. A mic icon will appear in your note, which you can press to record.
- **Transcription**: Automatically transcribes your voice recordings using the [OpenAI Whisper API](https://openai.com/index/whisper/).
- **Custom Prompts**: Apply custom prompts to the transcription to summarize, extract to-dos, or other actions.
- **Audio Playback**: Embeds the audio file in your note for easy access.
- **Embedded Output**: Transcriptions and AI-generated outputs are embedded in your note with headings.

## Installation

1. Download the NeuroVox plugin.
2. Move the plugin files to your Obsidian plugins directory (.obsidian/plugins).
3. Enable the plugin from the Obsidian settings by toggling it on.
4. Input your OpenAI API key (instructions below).

## Usage

1. **Recording**:
    - Insert a code block with three backticks, the word `record`, and three backticks again.
      
![neurovox record](https://github.com/Synaptic-Labs-AI/NeuroVox/assets/131487882/2996f6a1-fc1e-41cd-bd98-5d3218f260c3)

2. **Transcription**:
   	- Click the microphone icon to start recording.  
    - The plugin automatically transcribes your recording.

![neurovox mic button](https://github.com/Synaptic-Labs-AI/NeuroVox/assets/131487882/0ac849c9-46f2-43ab-b3ec-b282d3a4f4a8)


4. **Applying Prompts**:
    - Use custom prompts to process the transcription by going to settings and filling in the `Prompt` field.

5. **Embedded Output**:
    - The transcription and AI-generated content are embedded in your note with headings.

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

## Roadmap

- Add personalization options.
- Improve the user interface for easier configuration.
- Extend functionality with more AI-driven features.
- Add dynamic frontmatter generation

## Acknowledgments

Special thanks to:
- **James Griffin** (GitHub: [Forgetabyteit](https://github.com/Forgetabyteit))
- **David Youngblood** (GitHub: [LouminAI](https://github.com/thedavidyoungblood))
