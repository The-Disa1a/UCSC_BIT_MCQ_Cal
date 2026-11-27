import {defineConfig} from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    base: '/UCSC_BIT_MCQ_Cal/',
    plugins : [
        tailwindcss(),
    ],
    build: {
        rollupOptions: {
            input: {
                home: 'index.html',
                exam: 'exam.html',
            },
        },
    },
});