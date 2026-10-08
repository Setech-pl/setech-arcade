/*
 * wasm-glue.c - the thin C surface the browser prototype calls into
 * (atari800 7.2.1 libatari800, compiled with Emscripten).
 *
 * JS owns timing, rendering, audio and input; this file only steps frames
 * and exposes pointers. The disk lives in the Emscripten MEMFS at /d1.atr;
 * JS reads it back after writes to persist the best score.
 */
#include <emscripten/emscripten.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "libatari800/libatari800.h"

extern int Colours_table[256];
extern int Screen_show_disk_led, Screen_show_sector_counter, Screen_show_1200_leds;
extern void Atari800_Coldstart(void);
extern UWORD ANTIC_dlist;

static input_template_t input;
static int disk_writes;

static void on_disk_activity(int drive, int operation)
{
	/* libatari800 reports reads and writes; count writes (operation 1). */
	if (operation == 1) disk_writes++;
}

EMSCRIPTEN_KEEPALIVE int vs_init(int basic)
{
	static char *args[] = {
		"atari800", "-config", "/atari800.cfg", "-xl", "-pal", "-nobasic",
		"-xl-rev", "altirra", "-basic-rev", "altirra", "/d1.atr", NULL
	};
	args[5] = basic ? "-basic" : "-nobasic";
	libatari800_clear_input_array(&input);
	if (!libatari800_init(-1, args)) return 0;
	Screen_show_disk_led = Screen_show_sector_counter = Screen_show_1200_leds = 0;
	libatari800_set_disk_activity_callback(on_disk_activity);
	return 1;
}

/* One PAL frame. joy: bit0 up, bit1 down, bit2 left, bit3 right.
   console: bit0 START, bit1 SELECT, bit2 OPTION. special: 2 = RESET key. */
EMSCRIPTEN_KEEPALIVE int vs_frame(int joy, int trig, int keycode, int console_keys, int special)
{
	input.joy0 = (unsigned char)joy;
	input.trig0 = (unsigned char)trig;
	input.keychar = 0;
	input.keycode = (unsigned char)keycode;
	input.start = console_keys & 1;
	input.select = (console_keys >> 1) & 1;
	input.option = (console_keys >> 2) & 1;
	input.special = (unsigned char)special;
	libatari800_next_frame(&input);
	if (libatari800_error_code == LIBATARI800_DLIST_ERROR) libatari800_error_code = 0;
	return libatari800_error_code;
}

EMSCRIPTEN_KEEPALIVE void vs_coldstart(void) { Atari800_Coldstart(); }
EMSCRIPTEN_KEEPALIVE uint8_t *vs_screen(void) { return libatari800_get_screen_ptr(); }
EMSCRIPTEN_KEEPALIVE uint8_t *vs_memory(void) { return libatari800_get_main_memory_ptr(); }
EMSCRIPTEN_KEEPALIVE int *vs_palette(void) { return Colours_table; }
EMSCRIPTEN_KEEPALIVE uint8_t *vs_sound(void) { return libatari800_get_sound_buffer(); }
EMSCRIPTEN_KEEPALIVE int vs_sound_len(void) { return libatari800_get_sound_buffer_len(); }
EMSCRIPTEN_KEEPALIVE int vs_sound_rate(void) { return libatari800_get_sound_frequency(); }
EMSCRIPTEN_KEEPALIVE int vs_sound_channels(void) { return libatari800_get_num_sound_channels(); }
EMSCRIPTEN_KEEPALIVE int vs_sound_sample_size(void) { return libatari800_get_sound_sample_size(); }
EMSCRIPTEN_KEEPALIVE int vs_disk_writes(void) { return disk_writes; }

/* SIO writes go through stdio: flush before JS reads /d1.atr back. */
EMSCRIPTEN_KEEPALIVE void vs_flush(void) { fflush(NULL); }
EMSCRIPTEN_KEEPALIVE int vs_dlist(void) { return ANTIC_dlist; }
