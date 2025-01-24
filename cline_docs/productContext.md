# Product Context

## Purpose
NeuroVox is an Obsidian plugin that enhances note-taking with voice transcription and AI capabilities. It allows users to record voice notes directly in Obsidian and transcribe them using AI services.

## Problems Solved
- Manual transcription of voice recordings
- Integration of voice notes into Obsidian workflow
- Accessibility for users who prefer voice input
- Time-saving for content creation and note-taking

## Core Functionality
1. Voice Recording
   - Floating mic button in notes
   - Toolbar button option
   - Command palette integration
   
2. Transcription Services
   - OpenAI Whisper API integration
   - Groq API integration for faster processing
   - Automatic transcription of recordings
   
3. File Management
   - Automatic audio file storage
   - Transcription embedding in notes
   - Support for multiple audio formats

4. User Interface
   - Floating recording button
   - Timer modal for recording
   - Settings configuration panel
   - API key management

## Expected Behavior
1. Recording:
   - Click mic button to start recording
   - Timer modal shows recording duration
   - Stop recording to begin processing
   
2. Transcription:
   - Automatic processing after recording
   - Uses configured AI provider (OpenAI/Groq)
   - Embeds transcription at cursor position
   
3. Configuration:
   - API keys stored securely
   - Validation of API keys on entry
   - Persistent settings across sessions
