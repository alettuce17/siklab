(function () {
  'use strict';
  const TW = window.TW, S = TW.storage;
  const topics = [
    ['Which one is a living thing?', ['Rock', 'Butterfly', 'Chair', 'Spoon', 'Cup'], 1, 'Butterflies grow, need food, and reproduce.', 'Living Things'],
    ['What do most plants need to make food?', ['Sunlight', 'Plastic', 'Sand only', 'Paint', 'Glass'], 0, 'Plants use sunlight to make their own food.', 'Plants'],
    ['Which body part helps you breathe?', ['Stomach', 'Lungs', 'Elbow', 'Knee', 'Shoulder'], 1, 'Your lungs take in oxygen when you breathe.', 'Human Body'],
    ['Which animal grows from a tadpole?', ['Dog', 'Frog', 'Cat', 'Chicken', 'Fish'], 1, 'A tadpole grows and changes into a frog.', 'Animals'],
    ['What happens to ice when heated?', ['It melts', 'It becomes stone', 'It stays frozen forever', 'It disappears instantly', 'It turns to metal'], 0, 'Ice changes from solid water to liquid water as it warms.', 'Matter'],
    ['Which force pulls objects toward Earth?', ['Light', 'Sound', 'Gravity', 'Heat', 'Magnetism'], 2, 'Gravity pulls objects toward the ground.', 'Force and Motion'],
    ['What tool measures temperature?', ['Ruler', 'Thermometer', 'Scale', 'Compass', 'Stopwatch'], 1, 'Thermometers measure temperature.', 'Weather'],
    ['What should you do with a plastic bottle after use?', ['Throw it in a river', 'Burn it', 'Reuse or recycle it', 'Hide it in grass', 'Leave it on the beach'], 2, 'Reusing and recycling can reduce waste.', 'Environment'],
    ['Which part of a plant usually absorbs water?', ['Flower', 'Root', 'Fruit', 'Leaf tip', 'Petal'], 1, 'Roots take up water and minerals from the soil.', 'Plants'],
    ['Which animal has six legs as an adult?', ['Spider', 'Ant', 'Earthworm', 'Snail', 'Millipede'], 1, 'Adult insects, including ants, have six legs.', 'Animals'],
    ['Which sense organ lets us hear sounds?', ['Ears', 'Eyes', 'Nose', 'Tongue', 'Teeth'], 0, 'Our ears help us hear sound.', 'Human Body'],
    ['Which is a solid at room temperature?', ['Air', 'Water vapor', 'Wood', 'Steam', 'Milk'], 2, 'Wood has a definite shape and volume.', 'Matter'],
    ['What is a push?', ['A force that moves something away', 'A bright light', 'A sound', 'A type of plant', 'A force pulling toward you'], 0, 'A push applies force away from you.', 'Force and Motion'],
    ['What may you see in the sky before rain?', ['Dark clouds', 'A rainbow every time', 'Stars at noon', 'Snow in all places', 'Clear blue sky'], 0, 'Dark clouds may be a sign that rain is coming.', 'Weather'],
    ['Which action keeps rivers cleaner?', ['Dumping oil', 'Throwing wrappers', 'Using a trash bin', 'Washing paint into drains', 'Tossing more trash'], 2, 'Putting waste in proper bins reduces water pollution.', 'Environment'],
    ['Which item is nonliving?', ['Mango tree', 'Mushroom', 'Pencil', 'Grass', 'Butterfly'], 2, 'A pencil does not grow or reproduce.', 'Living Things'],
    ['What do leaves usually take in from the air for photosynthesis?', ['Carbon dioxide', 'Plastic dust', 'Smoke', 'Sand', 'Rubber bits'], 0, 'Leaves take in carbon dioxide used in making food.', 'Plants'],
    ['Which animal is a mammal?', ['Shark', 'Whale', 'Frog', 'Butterfly', 'Salmon'], 1, 'Whales are mammals that breathe air and feed milk to young.', 'Animals'],
    ['Which body part pumps blood?', ['Heart', 'Foot', 'Lung', 'Ear', 'Hand'], 0, 'The heart pumps blood around your body.', 'Human Body'],
    ['Water in a glass takes the shape of its container. It is a ____.', ['Gas', 'Liquid', 'Rock', 'Powder only', 'Wood'], 1, 'Liquids take the shape of the container holding them.', 'Matter'],
    ['What helps a bicycle slow down?', ['Brakes and friction', 'More sunlight', 'Loud music', 'Gravity disappearing', 'Painting the tires'], 0, 'Brakes create friction that helps slow the wheels.', 'Force and Motion'],
    ['What does a rain gauge measure?', ['Wind direction', 'Rainfall', 'Body temperature', 'Earthquakes', 'Cloud height'], 1, 'A rain gauge collects and measures rainfall.', 'Weather'],
    ['Which practice saves water?', ['Leaving taps running', 'Fixing leaking taps', 'Washing one spoon for an hour', 'Overflowing buckets', 'Letting the tap drip'], 1, 'Fixing leaks prevents water from being wasted.', 'Environment'],
    ['What is a seed likely to need to germinate?', ['Water', 'Plastic', 'Glue', 'Paint', 'Stone'], 0, 'Water helps a seed begin to grow.', 'Plants']
  ];
  function examples() {
    return topics.map(([text, choices, correct, explanation, category], i) => ({
      id: 'sample-' + (i + 1), text, choices, correct, explanation, category,
      difficulty: 'Easy', timeLimit: 0, image: '', createdAt: '2026-01-01T00:00:00.000Z'
    }));
  }
  function validImage(image) {
    return image === '' || (typeof image === 'string' && image.length < 1_300_000 &&
      /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(image));
  }
  function validate(q) {
    if (!q || typeof q !== 'object' || Array.isArray(q)) throw new Error('A question must be an object.');
    if (typeof q.text !== 'string' || !q.text.trim() || q.text.length > 1000) throw new Error('Question text must be 1–1000 characters.');
    if (!Array.isArray(q.choices) || ![4,5].includes(q.choices.length) || q.choices.some(c => typeof c !== 'string' || !c.trim() || c.length > 350))
      throw new Error('Questions need five answers; older four-answer questions can be edited to add E. Each answer may have up to 350 characters.');
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.choices.length) throw new Error('Choose one correct answer, A–E.');
    if (typeof q.category !== 'string' || !q.category.trim() || q.category.length > 80) throw new Error('Enter a category (80 characters maximum).');
    if (!['Easy', 'Medium', 'Hard'].includes(q.difficulty)) throw new Error('Choose Easy, Medium, or Hard difficulty.');
    if (!Number.isInteger(q.timeLimit) || (q.timeLimit !== 0 && (q.timeLimit < 5 || q.timeLimit > 180)))
      throw new Error('Question time limit must be 0 (use game settings) or 5–180 seconds.');
    if (typeof q.explanation !== 'string' || q.explanation.length > 1200) throw new Error('Explanation is too long.');
    if (!validImage(q.image)) throw new Error('Image must be a PNG, JPEG, WebP, or GIF smaller than 1 MB.');
    if (q.id != null && (typeof q.id !== 'string' || !q.id.trim() || q.id.length > 120)) throw new Error('Invalid question ID.');
    return { id: q.id || S.id(), text: q.text.trim(), choices: q.choices.map(x => x.trim()), correct: q.correct,
      explanation: q.explanation.trim(), category: q.category.trim(), difficulty: q.difficulty,
      timeLimit: q.timeLimit, image: q.image, createdAt: q.createdAt || new Date().toISOString() };
  }
  function validateMany(list) {
    if (!Array.isArray(list)) throw new Error('Questions must be provided as a JSON array.');
    const result = list.map(validate), ids = result.map(q => q.id);
    if (new Set(ids).size !== ids.length) throw new Error('Imported file contains duplicate question IDs.');
    return result;
  }
  function init() {
    if (!S.initialized('questions')) { S.write('questions', examples()); return; }
    // Complete untouched built-in samples from older releases, while leaving teacher questions unchanged.
    const saved = all(), updated = examples(); let changed = false;
    for (const q of saved) {
      const sample = updated.find(item => item.id === q.id);
      if (sample && q.choices?.length === 4 && sample.choices.slice(0,4).every((v,i) => v === q.choices[i])) {
        q.choices = sample.choices; changed = true;
      }
    }
    if (changed) save(saved);
  }
  function all() { const data = S.read('questions', []); return Array.isArray(data) ? data : []; }
  function save(list) { return S.write('questions', validateMany(list)); }
  function upsert(data) {
    const q = validate(data), list = all(), at = list.findIndex(x => x.id === q.id);
    if (at >= 0) list[at] = q; else list.push(q);
    return save(list);
  }
  function remove(ids) { return save(all().filter(q => !ids.includes(q.id))); }
  function importList(raw, mode) {
    const incoming = validateMany(raw), previous = mode === 'replace' ? [] : all();
    const known = new Set(previous.map(q => q.id));
    const unique = incoming.filter(q => !known.has(q.id));
    if (!save([...previous, ...unique])) throw new Error('Could not save imported questions. Storage may be full.');
    return {added: unique.length, skipped: incoming.length - unique.length};
  }
  TW.questions = {init, all, save, upsert, remove, validate, validateMany, importList, examples};
})();
