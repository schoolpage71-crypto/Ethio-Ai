const downloadSection = document.getElementById('download-section');
const chatSection = document.getElementById('chat-section');
const downloadBtn = document.getElementById('download-btn');
const statusText = document.getElementById('status-text');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');

const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

// 1. አፕሊኬሽኑ ሲከፈት ሞዴሉ መኖሩን ማረጋገጥ
window.addEventListener('DOMContentLoaded', async () => {
    const res = await window.api.checkModelStatus();
    if (res.exists) {
        showChatInterface();
    }
});

// 2. ተማሪው "AI ሞዴል አውርድ" የሚለውን ሲጫን
downloadBtn.addEventListener('click', () => {
    downloadBtn.style.display = 'none';
    progressContainer.style.display = 'block';
    statusText.innerText = 'ሞዴሉ ከ Hugging Face እየወረደ ነው (እባክዎ መረቡ እንዳይቋረጥ ይጠብቁ)...';
    
    window.api.startModelDownload();
});

// የዳውንሎድ ፐርሰንት መቀበል
window.api.onDownloadProgress((percent) => {
    progressBar.style.width = percent + '%';
    progressBar.innerText = percent + '%';
});

// የስታተስ መልዕክቶችን መቀበል
window.api.onStatusUpdate((data) => {
    if (data.type === 'success') {
        statusText.innerText = data.message;
        setTimeout(() => {
            showChatInterface();
        }, 1500);
    } else if (data.type === 'error') {
        statusText.innerText = data.message;
        downloadBtn.style.display = 'block';
    }
});

function showChatInterface() {
    downloadSection.style.display = 'none';
    chatSection.style.display = 'flex';
}

// 3. መልዕክት መላክ እና መቀበል
sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    // የተማሪውን መልዕክት በቻት ቦክስ ውስጥ ማሳየት
    appendMessage(text, 'user-message');
    userInput.value = '';

    // የ AI መልስ እስኪመጣ መጠበቂያ ሎዲንግ ሜሴጅ
    const loadingId = appendMessage('...', 'ai-message');

    const result = await window.api.sendChatMessage(text);
    
    // የሎዲንግ ሜሴጁን በማጥፋት ትክክለኛውን የ AI መልስ ማስገባት
    const loadingElement = document.getElementById(loadingId);
    if (result.success) {
        loadingElement.innerHTML = formatAIResponse(result.text);
        // KaTeX በመጠቀም ቀመሮችን ቅርጽ ማስያዝ
        renderMathInElement(loadingElement, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false}
            ]
        });
    } else {
        loadingElement.innerText = result.error;
    }

    chatBox.scrollTop = chatBox.scrollHeight;
}

function appendMessage(text, className) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${className}`;
    const id = 'msg-' + Date.now();
    messageDiv.id = id;
    messageDiv.innerText = text;
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return id;
}

// ከ AI የሚመጣውን ጽሁፍ ትንሽ ማስተካከል
function formatAIResponse(text) {
    // ተራ ጽሁፍ ወደ HTML (ቀላል ማስተካከያ)
    return text.replace(/\n/g, '<br>');
}
