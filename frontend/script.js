const API_URL = '';

document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('inputText');
    const highlights = document.getElementById('highlights');
    const resultsSection = document.getElementById('resultsSection');
    const loaderContainer = document.getElementById('loaderContainer');
    const statsDiv = document.getElementById('stats');

    let debounceTimer;
    let abortController = null;
    let currentSkills = [];

    // Sync scroll
    inputText.addEventListener('scroll', () => {
        highlights.scrollTop = inputText.scrollTop;
        highlights.scrollLeft = inputText.scrollLeft;
    });

    // Input event
    inputText.addEventListener('input', () => {
        const text = inputText.value;
        updateHighlights(text, currentSkills); // Keep existing highlights while typing

        // Debounce API call
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            extractSkills(text);
        }, 1000); // 1 second debounce
    });

    async function extractSkills(text) {
        if (!text.trim()) {
            currentSkills = [];
            updateHighlights(text, []);
            resultsSection.innerHTML = '';
            statsDiv.textContent = '';
            return;
        }

        // Cancel previous request
        if (abortController) {
            abortController.abort();
        }
        abortController = new AbortController();

        setLoading(true);

        try {
            const response = await fetch(`${API_URL}/extract`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: text, top_k: 3 }),
                signal: abortController.signal
            });

            if (!response.ok) {
                throw new Error(`Error: ${response.statusText}`);
            }

            const data = await response.json();
            currentSkills = data.extracted_skills;

            updateHighlights(text, currentSkills);
            renderResults(data);

        } catch (error) {
            if (error.name === 'AbortError') {
                return; // Ignore aborted requests
            }
            console.error('Extraction failed:', error);
            // Don't clear results on error, just log it
        } finally {
            setLoading(false);
        }
    }

    function updateHighlights(text, skills) {
        if (!skills || skills.length === 0) {
            highlights.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
            return;
        }

        // Escape HTML to prevent XSS and rendering issues
        let escapedText = escapeHtml(text);

        // Create a regex to match skills case-insensitively
        // Sort skills by length (descending) to avoid partial matches of shorter skills inside longer ones
        const sortedSkills = [...skills].sort((a, b) => b.length - a.length);

        // We need to be careful not to replace inside HTML tags if we had them, 
        // but since we escaped everything first, it's safer.
        // However, replacing "Go" in "Google" is a risk. 
        // We use word boundaries \b, but some skills might contain special chars.

        // A simple approach: Placeholder replacement
        // 1. Replace skills with unique placeholders
        // 2. Replace placeholders with <mark> tags

        let tempText = escapedText;
        const placeholders = [];

        sortedSkills.forEach((skill, index) => {
            const placeholder = `__SKILL_${index}__`;
            // Escape regex special characters in skill name
            const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedSkill}\\b`, 'gi');

            if (regex.test(tempText)) {
                placeholders.push({ placeholder, skill });
                tempText = tempText.replace(regex, (match) => {
                    return `<mark>${match}</mark>`; // Directly wrap for now, simple approach
                });
            }
        });

        // Handle newlines
        tempText = tempText.replace(/\n/g, '<br>');

        // For the backdrop to match textarea exactly, we need to ensure trailing newlines are handled
        if (text.endsWith('\n')) {
            tempText += '<br>';
        }

        highlights.innerHTML = tempText;
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function setLoading(isLoading) {
        if (isLoading) {
            loaderContainer.style.display = 'flex';
        } else {
            loaderContainer.style.display = 'none';
        }
    }

    function renderResults(data) {
        const { extracted_skills, mapped_skills, execution_time } = data;

        // Update stats
        statsDiv.textContent = `Found ${extracted_skills.length} skills in ${execution_time.toFixed(2)}s`;

        resultsSection.innerHTML = '';

        if (extracted_skills.length === 0) {
            return;
        }

        extracted_skills.forEach(skill => {
            const card = document.createElement('div');
            card.className = 'skill-card';

            const header = document.createElement('div');
            header.className = 'extracted-skill';
            header.textContent = skill;
            card.appendChild(header);

            const mappedContainer = document.createElement('div');
            mappedContainer.className = 'mapped-skills';

            const related = mapped_skills[skill] || [];
            if (related.length > 0) {
                related.forEach(item => {
                    const row = document.createElement('div');
                    row.className = 'mapped-item';

                    // Header row with Name and Score
                    const headerRow = document.createElement('div');
                    headerRow.style.display = 'flex';
                    headerRow.style.justifyContent = 'space-between';
                    headerRow.style.alignItems = 'center';

                    const name = document.createElement('span');
                    name.className = 'mapped-name';
                    name.textContent = item.name;

                    const score = document.createElement('span');
                    score.className = 'mapped-score';
                    score.textContent = `${(item.score * 100).toFixed(0)}%`;

                    headerRow.appendChild(name);
                    headerRow.appendChild(score);
                    row.appendChild(headerRow);

                    // Details row with SOC and UUID
                    const detailsDiv = document.createElement('div');
                    detailsDiv.style.fontSize = '0.8rem';
                    detailsDiv.style.color = '#666';
                    detailsDiv.style.marginTop = '4px';

                    if (item.soc_codes && item.soc_codes.length > 0) {
                        const socDiv = document.createElement('div');
                        socDiv.innerHTML = `<strong>SOC:</strong> ${item.soc_codes.join(', ')}`;
                        detailsDiv.appendChild(socDiv);
                    }

                    if (item.uuid) {
                        const uuidDiv = document.createElement('div');
                        uuidDiv.innerHTML = `<strong>UUID:</strong> <span style="font-family: monospace;">${item.uuid}</span>`;
                        detailsDiv.appendChild(uuidDiv);
                    }

                    row.appendChild(detailsDiv);
                    mappedContainer.appendChild(row);
                });
            } else {
                const empty = document.createElement('div');
                empty.className = 'mapped-item';
                empty.textContent = 'No O*NET match found';
                mappedContainer.appendChild(empty);
            }

            card.appendChild(mappedContainer);
            resultsSection.appendChild(card);
        });
    }
});
