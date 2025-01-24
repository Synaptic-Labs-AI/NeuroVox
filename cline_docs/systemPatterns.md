# System Patterns

## Architecture Overview
The plugin follows a modular architecture with clear separation of concerns:

### Core Components
1. Main Plugin Class (NeuroVoxPlugin)
   - Central orchestrator
   - Manages plugin lifecycle
   - Handles plugin initialization
   - Coordinates between components

2. AI Adapters
   - Abstract AIAdapter base class
   - Concrete implementations:
     - OpenAIAdapter
     - GroqAdapter
   - Handles API communication
   - Validates API keys

3. UI Components
   - FloatingButton: Recording button in notes
   - ToolbarButton: Recording button in toolbar
   - RecordingUI: Recording interface
   - TimerModal: Recording timer display

4. Settings Management
   - Settings storage and retrieval
   - API key configuration
   - UI preferences
   - Recording options

### Key Patterns
1. Singleton Pattern
   - Used for RecordingProcessor
   - Ensures single instance for recording management

2. Adapter Pattern
   - AI service adapters
   - Abstracts provider-specific logic

3. Observer Pattern
   - Event handling for workspace changes
   - File system monitoring
   - Settings updates

4. Factory Pattern
   - AI adapter creation
   - UI component initialization

## Technical Architecture
1. File Structure
   ```
   src/
   ├── adapters/         # AI service adapters
   ├── modals/          # Modal dialogs
   ├── settings/        # Settings management
   ├── ui/             # User interface components
   ├── utils/          # Utility functions
   ├── main.ts         # Plugin entry point
   └── types.ts        # Type definitions
   ```

2. Data Flow
   - User Input → UI Components
   - UI → Recording Manager
   - Recording → AI Adapter
   - AI Response → Document Embedding

3. State Management
   - Settings stored in Obsidian config
   - Runtime state in plugin instance
   - UI state in component classes

## Development Patterns
1. Error Handling
   - Descriptive error messages
   - User-friendly notifications
   - Graceful fallbacks

2. Code Organization
   - Modular component structure
   - Clear separation of concerns
   - TypeScript for type safety

3. Testing Approach
   - Manual testing of recordings
   - API validation checks
   - UI interaction testing
