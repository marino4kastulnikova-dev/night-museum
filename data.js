// Night Museum — collection data (11 public-domain works, chronological).
// Images load from Wikimedia Commons; if a file is unavailable the app falls back
// to the local copy in gallery/.
(function (root) {
  const W = 'https://upload.wikimedia.org/wikipedia/commons/thumb/';
  const ARTWORKS = [
    {
      id: '01', title: 'The Birth of Venus', credit: 'Sandro Botticelli · c. 1485',
      medium: 'Tempera on canvas', ratio: 1.592,
      src: W + '0/0b/Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg/1920px-Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg',
      local: 'gallery/01_botticelli_birth_of_venus.jpg',
      description: 'Venus arrives on a scallop shell, blown ashore by the wind god Zephyr, while a young woman waits with a flowered cloak. Probably painted for the Medici family.'
    },
    {
      id: '02', title: 'The Last Supper', credit: 'Leonardo da Vinci · c. 1495–98',
      medium: 'Tempera on plaster', ratio: 1.919,
      src: W + '0/08/Leonardo_da_Vinci_%281452-1519%29_-_The_Last_Supper_%281495-1498%29.jpg/1920px-Leonardo_da_Vinci_%281452-1519%29_-_The_Last_Supper_%281495-1498%29.jpg',
      local: 'gallery/02_leonardo_last_supper.jpg',
      description: 'Jesus has just said that one of the apostles will betray him, and shock ripples down the table. Leonardo painted it on a dry wall in Milan, and it began to fade within decades.'
    },
    {
      id: '03', title: 'Mona Lisa', credit: 'Leonardo da Vinci · c. 1503–1517',
      medium: 'Oil on poplar panel', ratio: 0.671,
      src: W + 'e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/1920px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg',
      local: 'gallery/03_leonardo_mona_lisa.jpg',
      description: 'Believed to portray Lisa Gherardini, wife of a Florentine silk merchant. Its fame soared after a Louvre employee stole it in 1911; it came back to Paris in 1914.'
    },
    {
      id: '04', title: 'The School of Athens', credit: 'Raphael · 1509–11',
      medium: 'Fresco', ratio: 1.289,
      src: W + '4/49/%22The_School_of_Athens%22_by_Raffaello_Sanzio_da_Urbino.jpg/1920px-%22The_School_of_Athens%22_by_Raffaello_Sanzio_da_Urbino.jpg',
      local: 'gallery/04_raphael_school_of_athens.jpg',
      description: 'Plato and Aristotle stride through a vast hall filled with ancient thinkers. Plato is believed to bear Leonardo’s face, and Raphael painted himself into the crowd.'
    },
    {
      id: '05', title: 'The Creation of Adam', credit: 'Michelangelo · c. 1508–12',
      medium: 'Fresco', ratio: 2.204,
      src: W + '5/5b/Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg/1920px-Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg',
      local: 'gallery/05_michelangelo_creation_of_adam.jpg',
      description: 'God reaches out to give life to Adam, their fingers almost touching. Part of the Sistine Chapel ceiling that Michelangelo painted for Pope Julius II.'
    },
    {
      id: '06', title: 'The Night Watch', credit: 'Rembrandt van Rijn · 1642',
      medium: 'Oil on canvas', ratio: 1.194,
      src: W + '5/5a/The_Night_Watch_-_HD.jpg/1920px-The_Night_Watch_-_HD.jpg',
      local: 'gallery/06_rembrandt_night_watch.jpg',
      description: 'Captain Frans Banninck Cocq sets his militia company in motion. It is a daytime scene: the nickname came in the 18th century, when darkened varnish made it look like night.'
    },
    {
      id: '07', title: 'Girl with a Pearl Earring', credit: 'Johannes Vermeer · c. 1665',
      medium: 'Oil on canvas', ratio: 0.844,
      src: W + '0/0f/1665_Girl_with_a_Pearl_Earring.jpg/1920px-1665_Girl_with_a_Pearl_Earring.jpg',
      local: 'gallery/07_vermeer_girl_with_a_pearl_earring.jpg',
      description: 'Not a portrait but a “tronie” — an imaginary figure in an exotic turban. The oversized pearl is painted with just two strokes of white.'
    },
    {
      id: '08', title: 'Impression, Sunrise', credit: 'Claude Monet · 1872',
      medium: 'Oil on canvas', ratio: 1.289,
      src: W + '5/59/Monet_-_Impression%2C_Sunrise.jpg/1920px-Monet_-_Impression%2C_Sunrise.jpg',
      local: 'gallery/08_monet_impression_sunrise.jpg',
      description: 'The harbour of Le Havre dissolves in morning mist. A critic mocked its title at the 1874 exhibition, and “Impressionism” became the name of a movement.'
    },
    {
      id: '09', title: 'The Starry Night', credit: 'Vincent van Gogh · 1889',
      medium: 'Oil on canvas', ratio: 1.263,
      src: W + 'e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/1920px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg',
      local: 'gallery/09_vangogh_starry_night.jpg',
      description: 'Painted in June 1889 at the asylum in Saint-Rémy. A swirling sky, a crescent moon and a flame-like cypress rise above a village Van Gogh reimagined rather than saw from his window.'
    },
    {
      id: '10', title: 'The Scream', credit: 'Edvard Munch · 1893',
      medium: 'Oil, tempera, pastel and crayon on cardboard', ratio: 0.806,
      src: W + 'c/c5/Edvard_Munch%2C_1893%2C_The_Scream%2C_oil%2C_tempera_and_pastel_on_cardboard%2C_91_x_73_cm%2C_National_Gallery_of_Norway.jpg/1920px-Edvard_Munch%2C_1893%2C_The_Scream%2C_oil%2C_tempera_and_pastel_on_cardboard%2C_91_x_73_cm%2C_National_Gallery_of_Norway.jpg',
      local: 'gallery/10_munch_scream.jpg',
      description: 'Munch recalled a sunset walk when the clouds turned blood red and he “sensed a scream passing through nature”. He made four versions: two paintings and two pastels.'
    },
    {
      id: '11', title: 'The Kiss', credit: 'Gustav Klimt · 1907–08',
      medium: 'Oil and gold leaf on canvas', ratio: 0.997,
      src: W + '4/40/The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg/1920px-The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg',
      local: 'gallery/11_klimt_the_kiss.jpg',
      description: 'A couple embraces in robes of gold leaf, the high point of Klimt’s “Golden Period”. The Austrian state bought it in 1908, before it was even finished.'
    }
  ];
  root.NM_ARTWORKS = ARTWORKS;
  if (typeof module !== 'undefined') module.exports = ARTWORKS;
})(typeof window !== 'undefined' ? window : globalThis);
