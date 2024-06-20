// src/utils/SvgUtils.ts
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
