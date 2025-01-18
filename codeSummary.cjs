#!/usr/bin/env node

/**
 * codeSummary.js
 *
 * This script generates a directory tree, collects code files,
 * sends the directory structure and code files to an LLM for analysis,
 * and compiles everything into a single Markdown file.
 * The final report includes a table of contents, directory structure,
 * LLM analysis, and code files. It also allows selective analysis based on
 * specified files or directories and includes a timestamp of when the report was generated.
 * Additionally, it manages the output directory and ensures it's excluded from git tracking.
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const axios = require('axios');
require('dotenv').config();

// Promisify fs functions for easier async/await usage
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const readdir = util.promisify(fs.readdir);
const appendFile = util.promisify(fs.appendFile);

// === Configuration ===

// Output directory
const outputDir = 'codeSummaryLogs';

// Ensure the output directory exists
function ensureOutputDirectory() {
  const dirPath = path.resolve(process.cwd(), outputDir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  } else {
    console.log(`Output directory already exists: ${outputDir}`);
  }
}

// Output file name with timestamp
const getFormattedDate = () => {
  const now = new Date();
  const pad = (n) => (n < 10 ? '0' + n : n);
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
};

const timestamp = getFormattedDate();
const outputFileName = `CodeAnalysis_${timestamp}.md`;
const outputFilePath = path.join(outputDir, outputFileName);

// Excluded directories and files
const excludedDirs = [
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'logs',
  'tmp',
  '.vscode',
  '.svelte-kit',
  outputDir, // Exclude the logs folder
];

const excludedFiles = [
  '.DS_Store',
  'Thumbs.db',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.env',
  '.gitignore',
  outputFileName,
  'codeSummary.js',
  'codeSummary.cjs',
  '*.config.js', // Exclude all config files ending with .config.js
  '*codesummary*', // Exclude any file or folder containing 'codesummary' in its name
];

// OpenRouter API configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const YOUR_SITE_URL = process.env.YOUR_SITE_URL || '';
const YOUR_SITE_NAME = process.env.YOUR_SITE_NAME || '';

// Validate API Key
if (!OPENROUTER_API_KEY) {
  console.error('Error: OPENROUTER_API_KEY is not set in the .env file.');
  process.exit(1);
}

/**
 * Function to parse command-line arguments for targets
 *
 * @returns {Array} - List of target file/directory paths
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const targets = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' || args[i] === '-t') {
      const target = args[i + 1];
      if (target) {
        // Support comma-separated targets
        targets.push(...target.split(',').map((t) => t.trim()));
        i++; // Skip next argument as it's part of this flag
      }
    } else if (args[i].startsWith('--target=')) {
      const target = args[i].split('=')[1];
      if (target) {
        targets.push(...target.split(',').map((t) => t.trim()));
      }
    }
  }

  return targets;
}

/**
 * Function to display usage instructions
 */
function displayHelp() {
  const helpText = `
Usage: node codeSummary.js [options]

Options:
  --target, -t <path>   Specify files or directories to analyze. You can provide multiple targets by repeating the flag or separating them with commas.
  --help, -h            Display this help message.

Examples:
  Analyze the entire project (default):
    node codeSummary.js

  Analyze specific directories:
    node codeSummary.js --target src/components --target src/utils

  Analyze specific files and directories:
    node codeSummary.js -t src/components,src/utils/helpers.ts,README.md
  `;
  console.log(helpText);
}

/**
 * Function to generate directory tree using improved ASCII characters
 *
 * @param {string} dir - The directory path to start from
 * @param {string} prefix - The prefix for the current level
 * @returns {string} - The formatted directory tree as a string
 */
async function generateDirectoryTree(dir, prefix = '') {
  let tree = '';
  const items = await getSortedItems(dir);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isLastItem = i === items.length - 1;
    const connector = isLastItem ? '└── ' : '├── ';
    tree += `${prefix}${connector}${item.name}\n`;

    if (item.isDirectory) {
      const newPrefix = prefix + (isLastItem ? '    ' : '│   ');
      tree += await generateDirectoryTree(item.path, newPrefix);
    }
  }

  return tree;
}

/**
 * Helper function to get sorted items in a directory
 *
 * @param {string} dir - Directory path
 * @returns {Array} - Sorted list of items with their paths and types
 */
async function getSortedItems(dir) {
  let rawItems;
  try {
    rawItems = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err.message);
    return [];
  }

  const filteredItems = rawItems.filter((item) => {
    return !isExcluded(item.name, item.isDirectory());
  });

  const sortedDirs = filteredItems
    .filter((item) => item.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const sortedFiles = filteredItems
    .filter((item) => item.isFile())
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...sortedDirs, ...sortedFiles].map((item) => ({
    name: item.name,
    path: path.join(dir, item.name),
    isDirectory: item.isDirectory(),
  }));
}

/**
 * Function to check if a file or directory should be excluded
 * Supports wildcard patterns like '*.config.js' and '*codesummary*'
 *
 * @param {string} name - The file or directory name
 * @param {boolean} isDir - Is the item a directory
 * @returns {boolean} - True if excluded, false otherwise
 */
function isExcluded(name, isDir) {
  if (isDir) {
    return excludedDirs.includes(name) || name.toLowerCase().includes('codesummary');
  } else {
    for (const pattern of excludedFiles) {
      if (pattern.startsWith('*')) {
        // Convert wildcard pattern to regular expression
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
        if (regex.test(name)) {
          return true;
        }
      } else if (name.toLowerCase().includes('codesummary')) {
        return true;
      } else if (name === pattern) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Function to read file content with size limitation
 *
 * @param {string} filePath - The path of the file to read
 * @param {number} maxSize - Maximum allowed file size in bytes
 * @returns {string|null} - The file content or null if exceeds size limit
 */
function readFileContent(filePath, maxSize = 1_000_000) {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > maxSize) {
      console.warn(`Skipping ${filePath} (exceeds size limit of ${maxSize} bytes).`);
      return null;
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`Error reading file ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Function to recursively get all files in specified targets
 *
 * @param {Array} targets - List of file/directory paths
 * @returns {Array} - List of file paths
 */
async function collectFiles(targets) {
  let filesList = [];

  for (const target of targets) {
    const resolvedPath = path.resolve(process.cwd(), target);
    if (!fs.existsSync(resolvedPath)) {
      console.warn(`Warning: Target path "${target}" does not exist. Skipping.`);
      continue;
    }

    const stats = fs.statSync(resolvedPath);
    if (stats.isDirectory()) {
      const nestedFiles = await getAllFiles(resolvedPath);
      filesList = filesList.concat(nestedFiles);
    } else if (stats.isFile()) {
      filesList.push(resolvedPath);
    } else {
      console.warn(`Warning: Target path "${target}" is neither a file nor a directory. Skipping.`);
    }
  }

  return filesList;
}

/**
 * Function to recursively get all files in a directory
 *
 * @param {string} dir - Directory path
 * @returns {Array} - List of file paths
 */
async function getAllFiles(dir) {
  let filesList = [];
  let items;
  try {
    items = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err.message);
    return filesList;
  }

  for (const item of items) {
    if (isExcluded(item.name, item.isDirectory())) {
      continue;
    }

    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      const nestedFiles = await getAllFiles(fullPath);
      filesList = filesList.concat(nestedFiles);
    } else {
      filesList.push(fullPath);
    }
  }

  return filesList;
}

/**
 * Function to send data to OpenRouter API
 *
 * @param {string} prompt - The prompt to send to the LLM
 * @returns {string} - The LLM's response
 */
async function sendToOpenRouter(prompt) {
  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': YOUR_SITE_URL,
          'X-Title': YOUR_SITE_NAME,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data?.choices?.[0]?.message?.content) {
      return response.data.choices[0].message.content.trim();
    } else {
      console.warn('No response content from OpenRouter API.');
      return '';
    }
  } catch (error) {
    console.error('Error communicating with OpenRouter API:', error.message);
    return '';
  }
}

/**
 * Function to analyze the codebase using LLM
 *
 * @param {string} directoryTree - The directory tree as a string
 * @param {Object} fileData - An object containing file paths and their content
 * @returns {string} - The analysis content
 */
async function analyzeCodebase(directoryTree, fileData) {
  console.log('Analyzing codebase with LLM...');

  if (Object.keys(fileData).length === 0) {
    console.error('No files available for analysis.');
    return '';
  }

  // Prepare prompt for LLM with an example
  const prompt = `
I have a codebase with the following directory structure:

\`\`\`
${directoryTree.trim()}
\`\`\`

Below are the files and their contents:

${Object.entries(fileData)
    .map(([file, data]) => {
      const contentSection = `### ${file}\n\`\`\`${path.extname(file).substring(1)}\n${data.content}\n\`\`\``;
      return contentSection;
    })
    .join('\n\n')}

**Example:**

### src/components/Button.tsx
\`\`\`typescript
import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
}

const Button: React.FC<ButtonProps> = ({ label, onClick }) => (
  <button onClick={onClick}>{label}</button>
);

export default Button;
\`\`\`

*Analysis Example:*
- **Purpose**: This file defines a reusable \`Button\` component that accepts a label and an \`onClick\` handler.
- **Interactions**: The \`Button\` component can be imported and used in other components like forms or dialogs to handle user interactions.
- **Improvement**: Consider adding PropTypes or using TypeScript for better type safety.

**Your Task:**

Please analyze the provided codebase structure and files. Focus on how different parts of the codebase interact with each other. Provide insights such as:

- **Summary**: A brief overview of what the codebase does.
- **Purpose of Main Directories and Files**: Explain the role of key directories and files.
- **Interactions**: Describe how different components, modules, or services interact within the codebase.
- **Improvements and Best Practices**: Suggest specific improvements or best practices that could be applied.

Avoid including code snippets in your response. Be clear and concise.
`;

  // Send prompt to OpenRouter
  const analysis = await sendToOpenRouter(prompt);

  if (analysis) {
    return analysis;
  } else {
    console.error('Error: No analysis was received from OpenRouter.');
    return '';
  }
}

/**
 * Function to generate a table of contents based on the sections
 *
 * @param {Array} sections - List of section names
 * @returns {string} - The table of contents in Markdown format
 */
function generateTableOfContents(sections) {
  let toc = '# Table of Contents\n\n';
  sections.forEach((section) => {
    const anchor = section.toLowerCase().replace(/\s+/g, '-');
    toc += `- [${section}](#${anchor})\n`;
  });
  toc += '\n';
  return toc;
}

/**
 * Function to add a folder to .gitignore
 *
 * @param {string} folderName - The folder to add to .gitignore
 */
async function addFolderToGitignore(folderName) {
  const gitignorePath = path.resolve(process.cwd(), '.gitignore');
  const folderEntry = `${folderName}/`;

  try {
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = await readFile(gitignorePath, 'utf8');
      const lines = gitignoreContent.split(/\r?\n/);
      if (!lines.includes(folderEntry)) {
        await appendFile(gitignorePath, `\n${folderEntry}\n`, 'utf8');
        console.log(`Added "${folderEntry}" to .gitignore.`);
      } else {
        console.log(`"${folderEntry}" is already present in .gitignore.`);
      }
    } else {
      // Create .gitignore and add the folder
      await writeFile(gitignorePath, `${folderEntry}\n`, 'utf8');
      console.log(`Created .gitignore and added "${folderEntry}".`);
    }
  } catch (err) {
    console.error(`Error updating .gitignore: ${err.message}`);
  }
}

/**
 * Main function to orchestrate the script
 */
async function main() {
  try {
    // Parse command-line arguments for targets
    const targets = parseCommandLineArgs();

    // If help flag is present, display help and exit
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      displayHelp();
      process.exit(0);
    }

    // Ensure the output directory exists
    ensureOutputDirectory();

    // Add the output directory to .gitignore
    await addFolderToGitignore(outputDir);

    // Determine if selective analysis is needed
    let filesToProcess = [];
    if (targets.length > 0) {
      console.log('Selective analysis mode activated.');
      filesToProcess = await collectFiles(targets);
      if (filesToProcess.length === 0) {
        console.error('No valid files found for the specified targets. Exiting.');
        process.exit(1);
      }
    } else {
      console.log('Analyzing the entire project.');
      // Collect all files in the project
      filesToProcess = await collectFiles(['.']);
    }

    // Initialize the output file
    await writeFile(outputFilePath, '', 'utf8');
    console.log(`Initialized ${outputFilePath}`);

    const sections = {};

    // Generate directory tree based on targets
    console.log('Generating directory tree...');
    const directoryTree = await generateDirectoryTree(process.cwd());
    sections['Directory'] = '```\n' + directoryTree + '\n```';
    console.log('Generated directory tree.');

    // Collect files and their contents
    console.log('Collecting files and their contents...');
    const fileData = {};

    for (const filePath of filesToProcess) {
      const relativePath = path.relative(process.cwd(), filePath).split(path.sep).join('/');
      const content = readFileContent(filePath);

      if (content !== null) {
        fileData[relativePath] = { content };
      }
    }

    // Analyze codebase using LLM
    console.log('Analyzing codebase...');
    const analysis = await analyzeCodebase(directoryTree, fileData);
    sections['Analysis'] = analysis || 'No analysis was generated.';
    console.log('Completed analysis.');

    // Prepare Code Files section
    console.log('Preparing Code Files section...');
    let codeFilesContent = '';
    for (const [relativePath, data] of Object.entries(fileData)) {
      codeFilesContent += `## ${relativePath}\n\n`;
      const fileExtension = path.extname(relativePath).substring(1);
      codeFilesContent += '```' + fileExtension + '\n' + data.content + '\n```\n\n';
    }
    sections['Code Files'] = codeFilesContent;
    console.log('Prepared Code Files section.');

    // Add timestamp to the report
    const generationTime = new Date();
    const formattedGenerationTime = generationTime.toLocaleString();
    sections['Report Generated On'] = `*Generated on ${formattedGenerationTime}*\n`;
    console.log('Added timestamp to the report.');

    // Generate table of contents
    console.log('Generating table of contents...');
    const toc = generateTableOfContents(Object.keys(sections));
    console.log('Generated table of contents.');

    // Write all content to the output file
    console.log('Writing content to the output file...');
    let finalContent = toc;
    for (const sectionName of ['Report Generated On', 'Directory', 'Analysis', 'Code Files']) {
      finalContent += `# ${sectionName}\n\n`;
      finalContent += sections[sectionName];
      finalContent += '\n\n';
    }
    await writeFile(outputFilePath, finalContent, 'utf8');

    console.log(`File '${outputFilePath}' has been successfully created.`);
  } catch (err) {
    console.error(`An error occurred: ${err.message}`);
  }
}

// Execute the main function
main();