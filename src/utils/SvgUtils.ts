/**
 * Utility function to create a button element with an embedded SVG icon.
 * 
 * @param svgText - The SVG content as a string.
 * @returns The HTMLButtonElement with the embedded SVG icon.
 */
export function createButtonWithSvgIcon(svgText: string): HTMLButtonElement {
    // Parse the SVG text into a DOM element
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgElement = svgDoc.documentElement as unknown as SVGElement;

    // Create a button element
    const button = document.createElement('button');
    
    // Append the SVG element to the button
    button.appendChild(svgElement);

    // Return the button element
    return button;
}
