// Photos to try. All are from the TEST set: the model never saw them while learning. They are not all answered
// correctly on purpose: the Bicol express gets "not sure" and the second Pinakbet is misnamed. Credits are as
// Wikimedia Commons gives them, and each links to its Commons page.
export interface Sample {
  file: string;
  /** What it really is, for the caption and the button label. */
  truth: string;
  title: string;
  credit: string;
  license: string;
  page: string;
}

const commons = (title: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title.replace(/ /g, "_"))}`;
const sample = (file: string, truth: string, title: string, credit: string, license: string): Sample => ({ file, truth, title, credit, license, page: commons(title) });

export const samples: Sample[] = [
  sample("dinuguan-2923494.jpg", "Dinuguan", "Dinuguan.jpg", "GracinhaMarco Abundo", "CC BY 2.0"),
  sample("longganisa-10427563.jpg", "Longganisa", "Vigan longganisa.JPG", "BrokenSphere", "CC BY-SA 3.0"),
  sample("pinakbet-12256191.jpg", "Pinakbet", "Pinakbet3.jpg", "Thepacificconoisseur", "CC BY 2.5"),
  sample("puto-12608070.jpg", "Puto", "Puto in banana leaf.jpg", "Obsidi ♠ n Soul", "CC0"),
  sample("pancit-18156307.jpg", "Pancit", "Pancit malabon.jpg", "Sugarkisses1202", "CC BY-SA 3.0"),
  sample("bicol-express-11261705.jpg", "Bicol Express", "Bicol express.jpg", "Clifford from Cebu City, Philippines", "CC BY 2.0"),
  sample("pinakbet-4405861.jpg", "Pinakbet", "Pinakbet.jpg", "Shubert Ciencia from Nueva Ecija, Philippines", "CC BY 2.0"),
  sample("other-333880.jpg", "Fresh ramen noodles (not a Filipino dish)", "Fresh ramen noodle 001.jpg", "Kropsoq", "CC BY-SA 3.0"),
  sample("other-3431746.jpg", "Shirasu in a salad (not a Filipino dish)", "Shirasu in salad.jpg", "Yuki Koga", "CC BY-SA 2.0"),
];
