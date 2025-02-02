# Product Context

## Purpose
NeuroVox is an Obsidian plugin that enhances note-taking with voice transcription, video transcription, and AI capabilities. It allows users to record voice notes directly in Obsidian and transcribe both audio and video content using AI services.

## Problems Solved
- Manual transcription of voice recordings and video content
- Integration of multimedia content into Obsidian workflow
- Accessibility for users who prefer voice input
- Time-saving for content creation and note-taking
- Handling of large audio files
- Summarization of long transcriptions

## Core Functionality
1. Voice Recording
   - Floating mic button in notes
   - Toolbar button option
   - Command palette integration
   - Timer modal with auto-stop capability
   - Custom button styling
   
2. Transcription Services
   - OpenAI Whisper API integration
   - Groq API integration for faster processing
   - Automatic transcription of recordings
   - Large file handling with chunking
   - Video file transcription support
   
3. File Management
   - Automatic audio/video file storage
   - Transcription embedding in notes
   - Support for multiple audio/video formats
   - Fuzzy search for audio files
   - Organized transcript storage

4. AI Features
   - Transcription with multiple providers
   - Configurable summary generation
   - Custom summary prompts
   - Temperature and token control
   - Multiple AI model support

5. User Interface
   - Floating recording button
   - Timer modal for recording
   - Settings configuration panel
   - API key management
   - Custom callout formatting
   - Progress indicators for large files

## Expected Behavior
1. Recording:
   - Click mic button to start recording
   - Timer modal shows recording duration
   - Optional auto-stop after set duration
   - Stop recording to begin processing
   
2. Transcription:
   - Automatic processing after recording
   - Large file chunking if needed
   - Uses configured AI provider (OpenAI/Groq)
   - Embeds transcription at cursor position
   - Optional file saving
   
3. Video Processing:
   - Support for mp4, webm, mov formats
   - Automatic format detection
   - Audio extraction
   - Transcription processing
   
4. Summary Generation:
   - Optional automatic summarization
   - Configurable summary length
   - Custom prompt templates
   - Model selection
   - Temperature control
   
5. Configuration:
   - API keys stored securely
   - Validation of API keys on entry
   - Persistent settings across sessions
   - Custom folder paths
   - Callout format customization
