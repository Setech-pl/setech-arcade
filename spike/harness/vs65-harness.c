/*
 * vs65-harness - a scripted, headless atari800 (libatari800) driver for the
 * Setech Arcade emulator spike.
 *
 *   vs65-harness [--os altirra|xl] [--basic on|off] [--machine xl|xe]
 *                --atr <disk copy> --script <file> --out <dir>
 *
 * The script is one command per line ('#' starts a comment):
 *
 *   frames N            advance N PAL frames with the current input
 *   joy c|u|d|l|r|ul|ur|dl|dr   joystick port 1 direction
 *   fire 0|1            port 1 trigger
 *   start 0|1 / select 0|1 / option 0|1   console keys (held until changed)
 *   key <hex AKEY>|none keyboard key (held until 'key none')
 *   reset               press RESET for one frame (warm start, as the key)
 *   coldstart           power cycle (the disk stays mounted)
 *   shotevery N PREFIX  also write <out>/PREFIX0001.png ... every N frames (0 stops)
 *   palette FILE        write the 256-entry RGB palette (768 bytes)
 *   shot NAME           write <out>/NAME.png (384x240, the full libatari800 frame)
 *   peek ADDR [N]       print N bytes from ADDR (hex)
 *   poke ADDR VAL       write one byte now
 *   hold ADDR VAL       write ADDR=VAL before every following frame
 *   unhold ADDR         stop holding ADDR
 *   until ADDR VAL MAX  run until mem[ADDR]==VAL, at most MAX frames (fails after)
 *   untilne ADDR VAL MAX  run until mem[ADDR]!=VAL
 *   sweep N [DIR]       automatic play: fire pulsed (4 on, 4 off), joystick L/R swapped every N frames,
 *                       DIR (u, d) held as well
 *                       (0 stops; 'joy' and 'fire' still apply when sweep is 0)
 *   hunt ADDR MIN MAX DWELL [DIR]  automatic play: fire pulsed, steer the X
 *                       at ADDR to targets spread over MIN..MAX, dwell DWELL
 *                       frames at each; DIR (u, d) held as well. 'hunt off' stops.
 *   watchdl             print ANTIC's display list pointer whenever it changes
 *   untildl ADDR MAX    run until ANTIC's display list pointer is ADDR
 *   watch ADDR          print frame number and value whenever mem[ADDR] changes
 *   wav FILE / wavstop  record POKEY output to a WAV file (relative to --out)
 *   savestate FILE / loadstate FILE
 *   mark TEXT           print the frame number with a label
 *
 * Every line printed on stdout starts with the PAL frame number.
 */
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <zlib.h>

#include "libatari800/libatari800.h"

extern int Colours_table[256];
extern void Atari800_Coldstart(void);
extern UWORD ANTIC_dlist;
extern int Screen_show_disk_led, Screen_show_sector_counter, Screen_show_1200_leds;

#define SCREEN_W 384
#define SCREEN_H 240
#define MAX_HOLDS 32
#define MAX_WATCH 16

static input_template_t input;
static int frame;
static char out_dir[1024] = ".";
static int hold_addr[MAX_HOLDS], hold_val[MAX_HOLDS], holds;
static int watch_addr[MAX_WATCH], watch_last[MAX_WATCH], watches;
static int watch_dl = -1;
static int shot_every, shot_count;
static char shot_prefix[256];
static int sweep_period, sweep_extra;
static int hunt_addr = -1, hunt_min, hunt_max, hunt_target, hunt_dwell, hunt_step, hunt_dwell_frames;
static UBYTE base_joy, base_fire;
static FILE *wav;
static uint32_t wav_bytes;

static void fail(const char *message)
{
	fprintf(stderr, "vs65-harness: %s\n", message);
	exit(1);
}

/* ---- PNG ---------------------------------------------------------------- */

static void put32(UBYTE *p, uint32_t v)
{
	p[0] = v >> 24; p[1] = v >> 16; p[2] = v >> 8; p[3] = v;
}

static void png_chunk(FILE *f, const char *type, const UBYTE *data, uint32_t len)
{
	UBYTE head[8];
	uint32_t crc;
	put32(head, len);
	memcpy(head + 4, type, 4);
	fwrite(head, 1, 8, f);
	if (len) fwrite(data, 1, len, f);
	crc = crc32(0, head + 4, 4);
	if (len) crc = crc32(crc, data, len);
	put32(head, crc);
	fwrite(head, 1, 4, f);
}

static void write_png(const char *name)
{
	static UBYTE raw[SCREEN_H * (1 + SCREEN_W * 3)];
	static UBYTE packed[SCREEN_H * (1 + SCREEN_W * 3) + 1024];
	UBYTE ihdr[13];
	uLongf packed_len = sizeof(packed);
	const UBYTE *screen = libatari800_get_screen_ptr();
	char path[2048];
	FILE *f;
	int x, y;

	for (y = 0; y < SCREEN_H; y++) {
		UBYTE *row = raw + y * (1 + SCREEN_W * 3);
		row[0] = 0;
		for (x = 0; x < SCREEN_W; x++) {
			int rgb = Colours_table[screen[y * SCREEN_W + x]];
			row[1 + x * 3] = (rgb >> 16) & 0xff;
			row[2 + x * 3] = (rgb >> 8) & 0xff;
			row[3 + x * 3] = rgb & 0xff;
		}
	}
	if (compress2(packed, &packed_len, raw, sizeof(raw), 9) != Z_OK)
		fail("PNG compression failed");
	snprintf(path, sizeof(path), "%s/%s.png", out_dir, name);
	f = fopen(path, "wb");
	if (!f) fail("cannot write a screenshot");
	fwrite("\x89PNG\r\n\x1a\n", 1, 8, f);
	put32(ihdr, SCREEN_W);
	put32(ihdr + 4, SCREEN_H);
	ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
	png_chunk(f, "IHDR", ihdr, 13);
	png_chunk(f, "IDAT", packed, (uint32_t)packed_len);
	png_chunk(f, "IEND", NULL, 0);
	fclose(f);
	printf("%d shot %s\n", frame, path);
}

/* ---- WAV ---------------------------------------------------------------- */

static void put_le(FILE *f, uint32_t v, int bytes)
{
	while (bytes--) { fputc(v & 0xff, f); v >>= 8; }
}

static void wav_open(const char *path)
{
	int channels = libatari800_get_num_sound_channels();
	int rate = libatari800_get_sound_frequency();
	int sample = libatari800_get_sound_sample_size();
	wav = fopen(path, "wb");
	if (!wav) fail("cannot write a WAV file");
	fputs("RIFF", wav); put_le(wav, 0, 4); fputs("WAVEfmt ", wav);
	put_le(wav, 16, 4); put_le(wav, 1, 2); put_le(wav, channels, 2);
	put_le(wav, rate, 4); put_le(wav, rate * channels * sample, 4);
	put_le(wav, channels * sample, 2); put_le(wav, sample * 8, 2);
	fputs("data", wav); put_le(wav, 0, 4);
	wav_bytes = 0;
	printf("%d wav %s (%d Hz, %d ch, %d-bit)\n", frame, path, rate, channels, sample * 8);
}

static void wav_close(void)
{
	if (!wav) return;
	fseek(wav, 4, SEEK_SET); put_le(wav, 36 + wav_bytes, 4);
	fseek(wav, 40, SEEK_SET); put_le(wav, wav_bytes, 4);
	fclose(wav);
	wav = NULL;
}

/* ---- emulation ---------------------------------------------------------- */

static void step(void)
{
	UBYTE *mem = libatari800_get_main_memory_ptr();
	int i;

	for (i = 0; i < holds; i++)
		mem[hold_addr[i]] = (UBYTE)hold_val[i];
	if (hunt_addr >= 0) {
		/* Steer port 1 toward a target X read from game RAM, dwell, pick the
		   next target: covers the whole width, unlike a blind L/R sweep. */
		int x = mem[hunt_addr];
		int span = hunt_max - hunt_min;
		if (hunt_dwell > 0) {
			input.joy0 = (UBYTE)sweep_extra;
			if (--hunt_dwell == 0) {
				hunt_step++;
				hunt_target = hunt_min + (hunt_step * 37 + (hunt_step * hunt_step) % 11) % (span + 1);
			}
		}
		else if (x < hunt_target - 2) input.joy0 = (UBYTE)(8 | sweep_extra);
		else if (x > hunt_target + 2) input.joy0 = (UBYTE)(4 | sweep_extra);
		else { input.joy0 = (UBYTE)sweep_extra; hunt_dwell = hunt_dwell_frames; }
		input.trig0 = (frame >> 2) & 1;
	}
	else if (sweep_period > 0) {
		input.joy0 = (((frame / sweep_period) & 1) ? 8 : 4) | sweep_extra;
		/* the fire button is edge-triggered: pulse it, 4 frames down, 4 up */
		input.trig0 = (frame >> 2) & 1;
	}
	else {
		input.joy0 = base_joy;
		input.trig0 = base_fire;
	}
	libatari800_next_frame(&input);
	frame++;
	/* libatari800 flags "display list error" whenever ANTIC_dlist is 0, which
	   is normal during a cold boot before the OS sets it; only a real CPU
	   crash (or BRK, self test...) stops the run. */
	if (libatari800_error_code == LIBATARI800_DLIST_ERROR) {
		static int reported;
		if (!reported++) printf("%d note: ANTIC_dlist==0 (ignored)\n", frame);
		libatari800_error_code = 0;
	}
	if (libatari800_error_code) {
		fprintf(stderr, "%d emulation error: %s\n", frame, libatari800_error_message());
		write_png("error");
		exit(2);
	}
	if (wav) {
		int len = libatari800_get_sound_buffer_len();
		fwrite(libatari800_get_sound_buffer(), 1, len, wav);
		wav_bytes += len;
	}
	if (shot_every > 0 && frame % shot_every == 0) {
		char name[300];
		snprintf(name, sizeof(name), "%s%04d", shot_prefix, ++shot_count);
		write_png(name);
	}
	if (watch_dl >= 0 && ANTIC_dlist != watch_dl) {
		printf("%d dlist %04X -> %04X\n", frame, watch_dl, ANTIC_dlist);
		watch_dl = ANTIC_dlist;
	}
	for (i = 0; i < watches; i++) {
		int v = mem[watch_addr[i]];
		if (v != watch_last[i]) {
			printf("%d watch %04X %02X -> %02X\n", frame, watch_addr[i], watch_last[i], v);
			watch_last[i] = v;
		}
	}
}

static int direction(const char *d)
{
	static const struct { const char *name; int bits; } table[] = {
		{"c", 0}, {"u", 1}, {"d", 2}, {"l", 4}, {"r", 8},
		{"ul", 5}, {"ur", 9}, {"dl", 6}, {"dr", 10}
	};
	size_t i;
	for (i = 0; i < sizeof(table) / sizeof(table[0]); i++)
		if (strcmp(d, table[i].name) == 0) return table[i].bits;
	fail("unknown joystick direction");
	return 0;
}

static long num(const char *s)
{
	return strtol(s, NULL, 0);
}

static void run_script(FILE *script)
{
	char line[512];
	int line_no = 0;

	while (fgets(line, sizeof(line), script)) {
		char cmd[64] = "", a[256] = "", b[64] = "", c[64] = "";
		char *hash = strchr(line, '#');
		int n;
		line_no++;
		if (hash) *hash = 0;
		n = sscanf(line, "%63s %255s %63s %63s", cmd, a, b, c);
		if (n <= 0) continue;
		if (strcmp(cmd, "frames") == 0) {
			long i, count = num(a);
			for (i = 0; i < count; i++) step();
		}
		else if (strcmp(cmd, "joy") == 0) base_joy = (UBYTE)direction(a);
		else if (strcmp(cmd, "fire") == 0) base_fire = (UBYTE)num(a);
		else if (strcmp(cmd, "start") == 0) input.start = (UBYTE)num(a);
		else if (strcmp(cmd, "select") == 0) input.select = (UBYTE)num(a);
		else if (strcmp(cmd, "option") == 0) input.option = (UBYTE)num(a);
		else if (strcmp(cmd, "key") == 0) {
			input.keychar = 0;
			input.keycode = strcmp(a, "none") == 0 ? 0 : (UBYTE)strtol(a, NULL, 16);
		}
		else if (strcmp(cmd, "reset") == 0) {
			input.special = 2; /* AKEY_WARMSTART: the RESET key */
			step();
			input.special = 0;
			printf("%d reset\n", frame);
		}
		else if (strcmp(cmd, "coldstart") == 0) {
			Atari800_Coldstart(); /* power off and on; the disk stays in D1: */
			printf("%d coldstart\n", frame);
		}
		else if (strcmp(cmd, "shot") == 0) write_png(a);
		else if (strcmp(cmd, "palette") == 0) {
			/* 256 x RGB of the palette the screenshots use */
			FILE *f = fopen(a, "wb");
			int i;
			if (!f) fail("cannot write the palette");
			for (i = 0; i < 256; i++) {
				fputc((Colours_table[i] >> 16) & 0xff, f);
				fputc((Colours_table[i] >> 8) & 0xff, f);
				fputc(Colours_table[i] & 0xff, f);
			}
			fclose(f);
		}
		else if (strcmp(cmd, "peek") == 0) {
			UBYTE *mem = libatari800_get_main_memory_ptr();
			long addr = num(a), count = n >= 3 ? num(b) : 1, i;
			printf("%d peek %04lX:", frame, addr);
			for (i = 0; i < count; i++) printf(" %02X", mem[(addr + i) & 0xffff]);
			printf("\n");
		}
		else if (strcmp(cmd, "poke") == 0) libatari800_get_main_memory_ptr()[num(a) & 0xffff] = (UBYTE)num(b);
		else if (strcmp(cmd, "hold") == 0) {
			if (holds == MAX_HOLDS) fail("too many holds");
			hold_addr[holds] = (int)(num(a) & 0xffff);
			hold_val[holds++] = (int)num(b);
		}
		else if (strcmp(cmd, "unhold") == 0) {
			int i, addr = (int)(num(a) & 0xffff);
			for (i = 0; i < holds; i++)
				if (hold_addr[i] == addr) {
					hold_addr[i] = hold_addr[--holds];
					hold_val[i] = hold_val[holds];
					i--;
				}
		}
		else if (strcmp(cmd, "until") == 0 || strcmp(cmd, "untilne") == 0) {
			int want_equal = strcmp(cmd, "until") == 0;
			int addr = (int)(num(a) & 0xffff), val = (int)num(b);
			long limit = num(c), i;
			UBYTE *mem = libatari800_get_main_memory_ptr();
			for (i = 0; i < limit; i++) {
				if ((mem[addr] == val) == want_equal) break;
				step();
			}
			if ((mem[addr] == val) != want_equal) {
				printf("%d TIMEOUT line %d: %s %04X %02X (is %02X)\n", frame, line_no, cmd, addr, val, mem[addr]);
				write_png("timeout");
				exit(3);
			}
			printf("%d reached %s %04X %02X after %ld frames\n", frame, cmd, addr, val, i);
		}
		else if (strcmp(cmd, "hunt") == 0) {
			/* hunt ADDR MIN MAX DWELL [DIR] ; hunt off */
			if (strcmp(a, "off") == 0) { hunt_addr = -1; sweep_extra = 0; }
			else {
				char d[16] = "c";
				if (sscanf(line, "%*s %*s %*s %*s %*s %15s", d) != 1) strcpy(d, "c");
				hunt_addr = (int)(num(a) & 0xffff);
				hunt_min = (int)num(b);
				hunt_max = (int)num(c);
				sscanf(line, "%*s %*s %*s %*s %d", &hunt_dwell_frames);
				sweep_period = 0;
				sweep_extra = direction(d);
				hunt_target = hunt_min;
				hunt_dwell = 0;
			}
		}
		else if (strcmp(cmd, "shotevery") == 0) {
			shot_every = (int)num(a);
			if (n >= 3) snprintf(shot_prefix, sizeof(shot_prefix), "%s", b);
			shot_count = 0;
		}
		else if (strcmp(cmd, "watchdl") == 0) {
			watch_dl = ANTIC_dlist;
			printf("%d dlist = %04X\n", frame, watch_dl);
		}
		else if (strcmp(cmd, "untildl") == 0) {
			/* untildl ADDR MAX: run until ANTIC's display list pointer is ADDR */
			int addr = (int)(num(a) & 0xffff);
			long limit = num(b), i;
			for (i = 0; i < limit && ANTIC_dlist != addr; i++) step();
			if (ANTIC_dlist != addr) {
				printf("%d TIMEOUT line %d: untildl %04X (is %04X)\n", frame, line_no, addr, ANTIC_dlist);
				write_png("timeout");
				exit(3);
			}
			printf("%d reached untildl %04X after %ld frames\n", frame, addr, i);
		}
		else if (strcmp(cmd, "sweep") == 0) {
			sweep_period = (int)num(a);
			sweep_extra = n >= 3 ? direction(b) : 0;
		}
		else if (strcmp(cmd, "watch") == 0) {
			if (watches == MAX_WATCH) fail("too many watches");
			watch_addr[watches] = (int)(num(a) & 0xffff);
			watch_last[watches] = libatari800_get_main_memory_ptr()[watch_addr[watches]];
			printf("%d watch %04X = %02X\n", frame, watch_addr[watches], watch_last[watches]);
			watches++;
		}
		else if (strcmp(cmd, "wav") == 0) {
			char wav_path[2048];
			if (a[0] == '/') snprintf(wav_path, sizeof(wav_path), "%s", a);
			else snprintf(wav_path, sizeof(wav_path), "%s/%s", out_dir, a);
			wav_open(wav_path);
		}
		else if (strcmp(cmd, "wavstop") == 0) wav_close();
		else if (strcmp(cmd, "savestate") == 0 || strcmp(cmd, "loadstate") == 0) {
			static emulator_state_t state;
			FILE *f = fopen(a, cmd[0] == 's' ? "wb" : "rb");
			if (!f) fail("cannot open a state file");
			if (cmd[0] == 's') {
				libatari800_get_current_state(&state);
				fwrite(&state, 1, sizeof(state), f);
			}
			else {
				if (fread(&state, 1, sizeof(state), f) != sizeof(state)) fail("short state file");
				libatari800_restore_state(&state);
			}
			fclose(f);
			printf("%d %s %s\n", frame, cmd, a);
		}
		else if (strcmp(cmd, "mark") == 0) printf("%d mark %s\n", frame, line + 5 + strspn(line + 4, " ") - 1);
		else {
			fprintf(stderr, "line %d: unknown command '%s'\n", line_no, cmd);
			exit(1);
		}
		fflush(stdout);
	}
}

int main(int argc, char **argv)
{
	const char *os = "altirra", *basic = "off", *machine = "xl";
	const char *atr = NULL, *script_path = NULL;
	const char *rom_dir = getenv("VS65_ROM_DIR");
	char xl_rom[1024], basic_rom[1024], cfg_path[1100];
	char *args[32];
	int nargs = 0, i;
	FILE *script;

	for (i = 1; i < argc; i++) {
		if (i + 1 >= argc) fail("every option takes a value");
		if (strcmp(argv[i], "--os") == 0) os = argv[++i];
		else if (strcmp(argv[i], "--basic") == 0) basic = argv[++i];
		else if (strcmp(argv[i], "--machine") == 0) machine = argv[++i];
		else if (strcmp(argv[i], "--atr") == 0) atr = argv[++i];
		else if (strcmp(argv[i], "--script") == 0) script_path = argv[++i];
		else if (strcmp(argv[i], "--out") == 0) snprintf(out_dir, sizeof(out_dir), "%s", argv[++i]);
		else fail("unknown option");
	}
	if (!atr || !script_path) fail("--atr and --script are required");

	args[nargs++] = "atari800";
	/* An empty config file: nothing from ~/.atari800.cfg leaks into a run. */
	args[nargs++] = "-config";
	if (getenv("VS65_EMPTY_CFG"))
		snprintf(cfg_path, sizeof(cfg_path), "%s", getenv("VS65_EMPTY_CFG"));
	else {
		/* <spike>/bin/vs65-harness -> <spike>/harness/cfg/atari800.cfg. A missing
		   file would make atari800 fall back to ~/.atari800.cfg. */
		char exe[1024], *slash;
		if (!realpath(argv[0], exe)) fail("cannot resolve the harness path");
		slash = strrchr(exe, '/'); if (slash) *slash = 0;
		snprintf(cfg_path, sizeof(cfg_path), "%s/../harness/cfg/atari800.cfg", exe);
	}
	{
		FILE *probe = fopen(cfg_path, "r");
		if (!probe) fail("the empty atari800.cfg is missing");
		fclose(probe);
	}
	args[nargs++] = cfg_path;
	args[nargs++] = strcmp(machine, "xe") == 0 ? "-xe" : "-xl";
	args[nargs++] = "-pal";
	args[nargs++] = strcmp(basic, "on") == 0 ? "-basic" : "-nobasic";
	if (strcmp(os, "altirra") == 0) {
		args[nargs++] = "-xl-rev"; args[nargs++] = "altirra";
		args[nargs++] = "-basic-rev"; args[nargs++] = "altirra";
	}
	else if (strcmp(os, "xl") == 0) {
		if (!rom_dir) fail("--os xl needs VS65_ROM_DIR with ATARIXL.ROM and ATARIBAS.ROM");
		snprintf(xl_rom, sizeof(xl_rom), "%s/ATARIXL.ROM", rom_dir);
		snprintf(basic_rom, sizeof(basic_rom), "%s/ATARIBAS.ROM", rom_dir);
		args[nargs++] = "-xlxe_rom"; args[nargs++] = xl_rom;
		args[nargs++] = "-xl-rev"; args[nargs++] = "2";
		args[nargs++] = "-basic_rom"; args[nargs++] = basic_rom;
		args[nargs++] = "-basic-rev"; args[nargs++] = "c";
	}
	else fail("--os is altirra or xl");
	args[nargs++] = (char *)atr;
	args[nargs] = NULL;

	script = fopen(script_path, "r");
	if (!script) fail("cannot open the script");
	libatari800_clear_input_array(&input);
	if (!libatari800_init(nargs, args)) fail("libatari800_init failed");
	/* atari800 draws its own disk LED and counters into the frame; the
	   comparisons need the bare Atari picture. */
	Screen_show_disk_led = Screen_show_sector_counter = Screen_show_1200_leds = 0;
	printf("0 init os=%s basic=%s machine=%s atr=%s\n", os, basic, machine, atr);
	run_script(script);
	wav_close();
	libatari800_exit();
	printf("%d done\n", frame);
	return 0;
}
