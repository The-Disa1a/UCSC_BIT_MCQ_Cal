// Get the correct base URL automatically from Vite
const baseUrl = import.meta.env.BASE_URL;

export async function fetchPapersMeta() {
    try {
        // Notice: We use baseUrl, and we DO NOT include "public/"
        const response = await fetch(`${baseUrl}answer_sheets/papers.json`);
        if (!response.ok) throw new Error("Failed to load papers.json");
        return await response.json();
    } catch (error) {
        console.error("Error fetching papers:", error);
        return null;
    }
}

export async function fetchPaperDetails(filePath) {
    try {
        // Notice: We use baseUrl, and we DO NOT include "public/"
        const response = await fetch(`${baseUrl}answer_sheets/${filePath}`);
        if (!response.ok) throw new Error("Failed to load paper details");
        return await response.json();
    } catch (error) {
        console.error("Error fetching paper details:", error);
        return null;
    }
}