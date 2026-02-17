const TILE = 24;

export const terrainAtlas = {
  frames: {
    grass: {
      frame: { x: TILE, y: TILE, w: TILE, h: TILE },
    },
    grass_dirt_1: {
      frame: { x: 0, y: TILE * 2, w: TILE, h: TILE },
    },
    grass_dirt_2: {
      frame: { x: TILE, y: TILE * 2, w: TILE, h: TILE },
    },
    grass_dirt_3: {
      frame: { x: 0, y: TILE * 3, w: TILE, h: TILE },
    },
    grass_dirt_4: {
      frame: { x: TILE, y: TILE * 3, w: TILE, h: TILE },
    },
    grass_weed_1: {
      frame: { x: 0, y: TILE * 4, w: TILE, h: TILE },
    },
    grass_weed_2: {
      frame: { x: TILE, y: TILE * 4, w: TILE, h: TILE },
    },
    grass_weed_3: {
      frame: { x: 0, y: TILE * 5, w: TILE, h: TILE },
    },
    grass_weed_4: {
      frame: { x: TILE, y: TILE * 5, w: TILE, h: TILE },
    },
    mountain_single: {
      frame: { x: TILE * 6, y: 0, w: TILE, h: TILE },
    },
    mountain_left: {
      frame: { x: TILE * 7, y: 0, w: TILE, h: TILE },
    },
    mountain_horizontal_mid: {
      frame: { x: TILE * 8, y: 0, w: TILE, h: TILE },
    },
    mountain_right: {
      frame: { x: TILE * 9, y: 0, w: TILE, h: TILE },
    },
    mountain_top: {
      frame: { x: TILE * 6, y: TILE, w: TILE, h: TILE },
    },
    mountain_bottom: {
      frame: { x: TILE * 6, y: TILE * 3, w: TILE, h: TILE },
    },
    mountain_vertical_mid: {
      frame: { x: TILE * 6, y: TILE * 2, w: TILE, h: TILE },
    },
    mountain_top_left: {
      frame: { x: TILE * 7, y: TILE, w: TILE, h: TILE },
    },
    mountain_bottom_left: {
      frame: { x: TILE * 7, y: TILE * 3, w: TILE, h: TILE },
    },
    mountain_top_mid: {
      frame: { x: TILE * 8, y: TILE, w: TILE, h: TILE },
    },
    mountain_top_right: {
      frame: { x: TILE * 9, y: TILE, w: TILE, h: TILE },
    },
    mountain_bottom_right: {
      frame: { x: TILE * 9, y: TILE * 3, w: TILE, h: TILE },
    },
    mountain_bottom_mid: {
      frame: { x: TILE * 8, y: TILE * 3, w: TILE, h: TILE },
    },
    mountain_mid_left: {
      frame: { x: TILE * 7, y: TILE * 2, w: TILE, h: TILE },
    },
    mountain_mid_right: {
      frame: { x: TILE * 9, y: TILE * 2, w: TILE, h: TILE },
    },
    mountain_mid_center: {
      frame: { x: TILE * 8, y: TILE * 2, w: TILE, h: TILE },
    },
    tree_single: {
      frame: { x: TILE * 6, y: TILE * 4, w: TILE, h: TILE },
    },
    tree_left: {
      frame: { x: TILE * 7, y: TILE * 4, w: TILE, h: TILE },
    },
    tree_horizontal_mid: {
      frame: { x: TILE * 8, y: TILE * 4, w: TILE, h: TILE },
    },
    tree_right: {
      frame: { x: TILE * 9, y: TILE * 4, w: TILE, h: TILE },
    },
    tree_top: {
      frame: { x: TILE * 6, y: TILE * 5, w: TILE, h: TILE },
    },
    tree_vertical_mid: {
      frame: { x: TILE * 6, y: TILE * 6, w: TILE, h: TILE },
    },
    tree_bottom: {
      frame: { x: TILE * 6, y: TILE * 7, w: TILE, h: TILE },
    },
    tree_top_left: {
      frame: { x: TILE * 7, y: TILE * 5, w: TILE, h: TILE },
    },
    tree_top_mid: {
      frame: { x: TILE * 8, y: TILE * 5, w: TILE, h: TILE },
    },
    tree_top_right: {
      frame: { x: TILE * 9, y: TILE * 5, w: TILE, h: TILE },
    },
    tree_mid_left: {
      frame: { x: TILE * 7, y: TILE * 6, w: TILE, h: TILE },
    },
    tree_mid_center: {
      frame: { x: TILE * 8, y: TILE * 6, w: TILE, h: TILE },
    },
    tree_mid_right: {
      frame: { x: TILE * 9, y: TILE * 6, w: TILE, h: TILE },
    },
    tree_bottom_left: {
      frame: { x: TILE * 7, y: TILE * 7, w: TILE, h: TILE },
    },
    tree_bottom_mid: {
      frame: { x: TILE * 8, y: TILE * 7, w: TILE, h: TILE },
    },
    tree_bottom_right: {
      frame: { x: TILE * 9, y: TILE * 7, w: TILE, h: TILE },
    },
    road_single: {
      frame: { x: TILE * 6, y: TILE * 8, w: TILE, h: TILE },
    },
    road_left: {
      frame: { x: TILE * 7, y: TILE * 8, w: TILE, h: TILE },
    },
    road_horizontal_mid: {
      frame: { x: TILE * 8, y: TILE * 8, w: TILE, h: TILE },
    },
    road_right: {
      frame: { x: TILE * 9, y: TILE * 8, w: TILE, h: TILE },
    },
    road_top: {
      frame: { x: TILE * 6, y: TILE * 9, w: TILE, h: TILE },
    },
    road_vertical_mid: {
      frame: { x: TILE * 6, y: TILE * 10, w: TILE, h: TILE },
    },
    road_bottom: {
      frame: { x: TILE * 6, y: TILE * 11, w: TILE, h: TILE },
    },
    road_top_left: {
      frame: { x: TILE * 7, y: TILE * 9, w: TILE, h: TILE },
    },
    road_top_mid: {
      frame: { x: TILE * 8, y: TILE * 9, w: TILE, h: TILE },
    },
    road_top_right: {
      frame: { x: TILE * 9, y: TILE * 9, w: TILE, h: TILE },
    },
    road_mid_left: {
      frame: { x: TILE * 7, y: TILE * 10, w: TILE, h: TILE },
    },
    road_mid_center: {
      frame: { x: TILE * 8, y: TILE * 10, w: TILE, h: TILE },
    },
    road_mid_right: {
      frame: { x: TILE * 9, y: TILE * 10, w: TILE, h: TILE },
    },
    road_bottom_left: {
      frame: { x: TILE * 7, y: TILE * 11, w: TILE, h: TILE },
    },
    road_bottom_mid: {
      frame: { x: TILE * 8, y: TILE * 11, w: TILE, h: TILE },
    },
    road_bottom_right: {
      frame: { x: TILE * 9, y: TILE * 11, w: TILE, h: TILE },
    },
    dirtroad_single: {
      frame: { x: TILE * 6, y: TILE * 12, w: TILE, h: TILE },
    },
    dirtroad_left: {
      frame: { x: TILE * 7, y: TILE * 12, w: TILE, h: TILE },
    },
    dirtroad_horizontal_mid: {
      frame: { x: TILE * 8, y: TILE * 12, w: TILE, h: TILE },
    },
    dirtroad_right: {
      frame: { x: TILE * 9, y: TILE * 12, w: TILE, h: TILE },
    },
    dirtroad_top: {
      frame: { x: TILE * 6, y: TILE * 13, w: TILE, h: TILE },
    },
    dirtroad_vertical_mid: {
      frame: { x: TILE * 6, y: TILE * 14, w: TILE, h: TILE },
    },
    dirtroad_bottom: {
      frame: { x: TILE * 6, y: TILE * 15, w: TILE, h: TILE },
    },
    dirtroad_top_left: {
      frame: { x: TILE * 7, y: TILE * 13, w: TILE, h: TILE },
    },
    dirtroad_top_mid: {
      frame: { x: TILE * 8, y: TILE * 13, w: TILE, h: TILE },
    },
    dirtroad_top_right: {
      frame: { x: TILE * 9, y: TILE * 13, w: TILE, h: TILE },
    },
    dirtroad_mid_left: {
      frame: { x: TILE * 7, y: TILE * 14, w: TILE, h: TILE },
    },
    dirtroad_mid_center: {
      frame: { x: TILE * 8, y: TILE * 14, w: TILE, h: TILE },
    },
    dirtroad_mid_right: {
      frame: { x: TILE * 9, y: TILE * 14, w: TILE, h: TILE },
    },
    dirtroad_bottom_left: {
      frame: { x: TILE * 7, y: TILE * 15, w: TILE, h: TILE },
    },
    dirtroad_bottom_mid: {
      frame: { x: TILE * 8, y: TILE * 15, w: TILE, h: TILE },
    },
    dirtroad_bottom_right: {
      frame: { x: TILE * 9, y: TILE * 15, w: TILE, h: TILE },
    },
  },
  meta: {
    image: "/tilesets/terrain.png",
    scale: 1,
  },
};
