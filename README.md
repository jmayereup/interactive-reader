# Interactive Reader Custom Element

This is a custom element for use on blogs to allow preformatted text to be displayed in a reading tool.
It has pop-up translations, text-to-speech, and a user wordlist saved to local storage.
The wordbank can easily be generated with contextual translations using an AI of your choice.

## Development Setup

This project uses Tailwind CSS v4 with the CLI for styling. To work on the project:

1. Install dependencies: `npm install`
2. For development, run the CSS watcher: `npm run watch-css`
3. To build CSS for production: `npm run build-css`

Custom styles are defined in `input.css` and compiled to `interactive-reader.css`. The CSS is automatically injected into the Shadow DOM at runtime.

## Architecture

- **Shadow DOM**: The component uses Shadow DOM for style encapsulation
- **CSS Injection**: Tailwind CSS is fetched and injected into the Shadow DOM at runtime
- **Modular**: Template and styles are loaded as separate files for maintainability

## Usage

To use it you need to include the interactive-reader.js and reader-template.html files in an accessible place on your web server. 
Then import it into your header or footer using code injection:
```html
<script type="module" src="/path/to/interactive-reader.js"></script>
```

In an HTML block, format your text as follows:

<interactive-reader>
    New Year's Celebrations Around the World
    ---
    "I celebrate the new year with my family and friends in New York City. We go to Times Square and watch the ball drop, which is a tradition that started in 1907¹. It is very exciting and crowded, but also very cold. We wear hats and scarves and drink hot chocolate to keep warm. We count down from 10 to 1 and cheer when the new year begins. Then we hug and kiss and wish each other a happy new year."

    "I celebrate the new year with my relatives in Beijing, China. We follow the lunar calendar, so our new year is usually in late January or early February². It is the most important festival in our culture. We decorate our houses with red lanterns and paper cuttings, and we wear new clothes. We eat dumplings and other special foods, and we give each other red envelopes with money. We also set off fireworks and watch the dragon dance."
    ---
    how: อย่างไร, do: ทำ, you: คุณ, celebrate: เฉลิมฉลอง, the: (คำนำหน้านามชี้เฉพาะ), new: ใหม่, year: ปี, i: ฉัน, with: กับ, my: ของฉัน, family: ครอบครัว, and: และ, friends: เพื่อน, in: ใน, york: ยอร์ก, city: เมือง, we: พวกเรา, go: ไป, to: ถึง, times: ไทมส์, square: สแควร์, watch: ดู, ball: ลูกบอล, drop: หล่น, which: ซึ่ง, is: เป็น, a: หนึ่ง, tradition: ประเพณี, that: ที่, started: เริ่มต้นแล้ว, it: มัน, very: มาก, exciting: น่าตื่นเต้น, crowded: แออัด, but: แต่, also: ด้วย, cold: หนาว, wear: สวมใส่, hats: หมวก, scarves: ผ้าพันคอ, drink: ดื่ม, hot: ร้อน, chocolate: ช็อคโกแลต, keep: เก็บ, warm: อบอุ่น, count: นับ, down: ลง, from: จาก, cheer: ไชโย, when: เมื่อ, begins: เริ่มต้น, then: จากนั้น, hug: กอด, kiss: จูบ, wish: ปรารถนา, each: แต่ละ, other: อื่น, happy: มีความสุข, relatives: ญาติ, follow: ติดตาม, lunar: เกี่ยวกับดวงจันทร์, calendar: ปฏิทิน, so: ดังนั้น, our: ของเรา, usually: โดยปกติ, late: สาย, january: มกราคม, or: หรือ, early: เร็ว, february: กุมภาพันธ์, most: ที่สุด, important: สำคัญ, festival: เทศกาล, culture: วัฒนธรรม, decorate: ตกแต่ง, houses: บ้าน, red: สีแดง, lanterns: โคมไฟ, paper: กระดาษ, cuttings: ของที่ตัดออกมา, clothes: เสื้อผ้า, eat: กิน, dumplings: เกี๊ยว, special: พิเศษ, foods: อาหาร, give: ให้, envelopes: ซองจดหมาย, money: เงิน, set: จัด, off: ออกไป, fireworks: ดอกไม้ไฟ, dragon: มังกร, dance: เต้นรำ
</interactive-reader>

<img width="856" height="882" alt="image" src="https://github.com/user-attachments/assets/44696175-fa04-4316-86c1-fc9fb03983bf" />
