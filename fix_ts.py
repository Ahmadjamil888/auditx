import re
import os

def fix_file(path, replacements):
    with open(path, 'r') as f:
        content = f.read()
    
    for pattern, subst in replacements:
        content = re.sub(pattern, subst, content)
    
    with open(path, 'w') as f:
        f.write(content)

# Fix ParsedStatement in ai-service.ts
fix_file('src/lib/ai-service.ts', [
    (r'transaction_date\?: string;', 'transaction_date?: string | undefined;'),
    (r'ticker\?:           string;', 'ticker?:           string | undefined;'),
    (r'action\?\:           "BUY" \| "SELL" \| "DIV";', 'action?:           "BUY" | "SELL" | "DIV" | undefined;'),
    (r'quantity\?\:         number;', 'quantity?:         number | undefined;'),
    (r'price\?\:            number;', 'price?:            number | undefined;'),
    (r'fees\?\:             number;', 'fees?:             number | undefined;'),
    (r'wht\?\:              number;', 'wht?:              number | undefined;'),
    (r'ref_id\?\:           string;', 'ref_id?:           string | undefined;'),
    (r'broker\?\:           string;', 'broker?:           string | undefined;'),
    (r'exchange\?\:         string;', 'exchange?:         string | undefined;'),
    (r'model_used\?\:        string;', 'model_used?:        string | undefined;'),
])

# Fix index access in ai-service.ts
# This is tricky with regex, so I'll do a broader replacement for common ones
common_keys = ['transaction_date', 'ticker', 'action', 'quantity', 'price', 'fees', 'wht', 'ref_id', 'broker', 'exchange', 'field_confidences']
for key in common_keys:
    fix_file('src/lib/ai-service.ts', [
        (rf'\.({key})\b', rf'["\1"]')
    ])

# Specific fixes for ai-service.ts
fix_file('src/lib/ai-service.ts', [
    (r'import\.meta\.env\.VITE_GOOGLE_AI_API_KEY', "import.meta.env['VITE_GOOGLE_AI_API_KEY']"),
    (r'const model = MODELS\[key\];', 'const model = MODELS[key as keyof typeof MODELS];'),
])

# Fix agent-tools.ts remaining errors
fix_file('src/lib/agent-tools.ts', [
    (r'updates\.ticker = updates\.ticker\.toUpperCase\(\);', "updates['ticker'] = String(updates['ticker']).toUpperCase();"),
    (r'updates\.action  = updates\.action\.toUpperCase\(\);', "updates['action'] = String(updates['action']).toUpperCase() as any;"),
    (r'case "BUY":\s+return "ok";', 'case "BUY": return "ok" as any;'), # Handle "ok" | "warn" | "bad"
    (r'\.catch\(', '?.catch('), # PromiseLike might not have .catch if it is just Thenable
])

# Fix agent-service.ts config issue
fix_file('src/lib/agent-service.ts', [
    (r'config:   config   as Parameters<typeof ai.models.generateContentStream>\[0\]\["config"\],', 'config:   (config as any) as Parameters<typeof ai.models.generateContentStream>[0]["config"],'),
])
